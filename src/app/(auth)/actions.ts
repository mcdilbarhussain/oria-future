"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticator } from "otplib";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword, passwordSchema } from "@/lib/password";
import { createSession, destroySession, clientInfo, getPendingUser } from "@/lib/auth";
import { decrypt, randomToken, sha256 } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { sendMail } from "@/lib/mail";
import { rateLimit } from "@/lib/ratelimit";
import type { ActionResult } from "@/lib/action";

let dummyHash: string | null = null;
const MAX_FAILED = 5;
const LOCK_MIN = 15;

export async function loginAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const password = String(fd.get("password") || "");
  const { ip, userAgent } = await clientInfo();
  if (!rateLimit(`login:${ip}`, 20, 15 * 60_000)) return { ok: false, error: "Too many login attempts from this network. Try again in 15 minutes." };
  const fail = async (reason: string, userId?: string) => {
    await prisma.loginLog.create({ data: { email, success: false, reason, ip, userAgent, userId } });
    return { ok: false as const, error: "Invalid email or password." };
  };
  if (!email || !password) return { ok: false, error: "Email and password are required." };
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.deletedAt) { await verifyPassword(password, (dummyHash ??= await hashPassword("timing-equaliser"))); return fail("unknown_user"); }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await prisma.loginLog.create({ data: { email, success: false, reason: "locked", ip, userAgent, userId: user.id } });
    return { ok: false, error: `Account temporarily locked after repeated failed attempts. Try again after ${user.lockedUntil.toLocaleTimeString("en-GB")}.` };
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: failed >= MAX_FAILED ? 0 : failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MIN * 60_000) : null } });
    return fail("bad_password", user.id);
  }
  if (user.status !== "ACTIVE") { await prisma.loginLog.create({ data: { email, success: false, reason: "suspended", ip, userAgent, userId: user.id } }); return { ok: false, error: "This account is suspended. Contact your administrator." }; }
  await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  if (user.totpEnabled) {
    await createSession(user.id, true);
    redirect("/login/2fa");
  }
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await prisma.loginLog.create({ data: { email, success: true, ip, userAgent, userId: user.id } });
  redirect(String(fd.get("next") || "").startsWith("/") && !String(fd.get("next")).startsWith("//") ? String(fd.get("next")) : "/dashboard");
}

export async function verify2FAAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const pending = await getPendingUser();
  if (!pending || !pending.pending2FA) redirect("/login");
  const { ip, userAgent } = await clientInfo();
  if (!rateLimit(`2fa:${pending.id}`, 8, 10 * 60_000)) return { ok: false, error: "Too many attempts. Please sign in again later." };
  const u = await prisma.user.findUniqueOrThrow({ where: { id: pending.id } });
  const code = String(fd.get("code") || "").replace(/\s/g, "");
  if (!u.totpSecretEnc || !authenticator.verify({ token: code, secret: decrypt(u.totpSecretEnc) })) {
    await prisma.loginLog.create({ data: { email: u.email, success: false, reason: "bad_2fa", ip, userAgent, userId: u.id } });
    return { ok: false, error: "Invalid authentication code." };
  }
  await prisma.session.delete({ where: { id: pending.sessionId } });
  await createSession(u.id);
  await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
  await prisma.loginLog.create({ data: { email: u.email, success: true, reason: "2fa", ip, userAgent, userId: u.id } });
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function forgotPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const email = String(fd.get("email") || "").trim().toLowerCase();
  const { ip } = await clientInfo();
  if (!rateLimit(`forgot:${ip}`, 5, 15 * 60_000)) return { ok: false, error: "Too many requests. Please try again later." };
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null, status: "ACTIVE" } });
  if (user) {
    const token = randomToken(32);
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) } });
    const link = `${process.env.APP_URL || "http://localhost:3000"}/reset-password?token=${token}`;
    const sent = await sendMail(user.email, "Reset your ORIA FUTURE password", `Hello ${user.name},\n\nUse this link to reset your password (valid for 1 hour):\n${link}\n\nIf you did not request this, you can ignore this email.`);
    if (!sent) console.warn(`[password-reset] SMTP not configured. Reset link for ${user.email}: ${link}`);
    await audit({ userId: user.id, module: "employees", action: "password_reset_requested", summary: `Password reset requested for ${user.email}` });
  }
  // Same response whether or not the account exists (prevents account enumeration)
  return { ok: true, message: "If an account exists for that email, a reset link has been sent. Ask your administrator if you don't receive it." };
}

export async function resetPasswordAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const token = String(fd.get("token") || "");
  const parsed = passwordSchema.safeParse(String(fd.get("password") || ""));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  if (fd.get("password") !== fd.get("confirm")) return { ok: false, error: "Passwords do not match." };
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) return { ok: false, error: "This reset link is invalid or has expired." };
  await prisma.$transaction([
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(parsed.data), mustChangePassword: false, failedLogins: 0, lockedUntil: null } }),
    prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: rec.userId } }),
  ]);
  await audit({ userId: rec.userId, module: "employees", action: "password_reset", summary: "Password reset via email link" });
  return { ok: true, message: "Password updated. You can now sign in." };
}
void z;
