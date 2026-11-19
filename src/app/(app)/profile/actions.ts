"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { run, zs, UserError, type ActionResult } from "@/lib/action";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/password";
import { encrypt, decrypt } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export async function updateProfile(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    const d = z.object({ name: zs.str(120), phone: zs.optStr(40) }).parse({ name: fd.get("name"), phone: fd.get("phone") ?? "" });
    await prisma.user.update({ where: { id: u.id }, data: d });
    await audit({ userId: u.id, module: "employees", action: "update_profile", summary: "updated own profile" });
    revalidatePath("/profile");
    return { ok: true, message: "Profile updated." };
  });
}

export async function changePassword(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    const full = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await verifyPassword(String(fd.get("current") || ""), full.passwordHash))) throw new UserError("Current password is incorrect.");
    const pw = passwordSchema.parse(fd.get("password"));
    if (pw !== fd.get("confirm")) throw new UserError("Passwords do not match.");
    if (await verifyPassword(pw, full.passwordHash)) throw new UserError("New password must be different.");
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: false } });
    await prisma.session.deleteMany({ where: { userId: u.id, id: { not: u.sessionId } } });
    await audit({ userId: u.id, module: "employees", action: "change_password", summary: "changed own password" });
    revalidatePath("/", "layout");
    return { ok: true, message: "Password changed. Other sessions were signed out." };
  });
}

export async function start2FA(_: unknown): Promise<ActionResult<{ secret: string; qr: string }>> {
  return run(async () => {
    const u = await requireUser();
    if (u.totpEnabled) throw new UserError("Two-factor authentication is already enabled.");
    const secret = authenticator.generateSecret();
    await prisma.user.update({ where: { id: u.id }, data: { totpSecretEnc: encrypt(secret) } });
    const qr = await QRCode.toDataURL(authenticator.keyuri(u.email, "ORIA FUTURE ERP", secret));
    return { ok: true, data: { secret, qr } };
  });
}

export async function confirm2FA(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    const full = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!full.totpSecretEnc) throw new UserError("Start the setup first.");
    if (!authenticator.verify({ token: String(fd.get("code") || "").replace(/\s/g, ""), secret: decrypt(full.totpSecretEnc) })) throw new UserError("Code is incorrect – check your phone's time is correct and try again.");
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: true } });
    await audit({ userId: u.id, module: "employees", action: "enable_2fa", summary: "enabled two-factor authentication" });
    revalidatePath("/profile");
    return { ok: true, message: "Two-factor authentication enabled." };
  });
}

export async function disable2FA(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    const full = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await verifyPassword(String(fd.get("password") || ""), full.passwordHash))) throw new UserError("Password is incorrect.");
    await prisma.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecretEnc: null } });
    await audit({ userId: u.id, module: "employees", action: "disable_2fa", summary: "disabled two-factor authentication" });
    revalidatePath("/profile");
    return { ok: true, message: "2FA disabled." };
  });
}

export async function revokeSession(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    await prisma.session.deleteMany({ where: { id: String(fd.get("id")), userId: u.id } });
    revalidatePath("/profile");
    return { ok: true };
  });
}
