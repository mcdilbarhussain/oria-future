import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { can, type Action, type Module, type PermissionSet, SUPER_ADMIN_KEY } from "./permissions";

export const SESSION_COOKIE = "oria_session";
const TTL_H = Number(process.env.SESSION_TTL_HOURS || 12);
const IDLE_MIN = Number(process.env.SESSION_IDLE_MINUTES || 60);

export class ForbiddenError extends Error {
  constructor(msg = "You do not have permission to perform this action.") { super(msg); this.name = "ForbiddenError"; }
}

export async function clientInfo() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "unknown").trim();
  return { ip, userAgent: h.get("user-agent")?.slice(0, 300) || null };
}

export async function createSession(userId: string, pending2FA = false) {
  const token = randomToken(32);
  const { ip, userAgent } = await clientInfo();
  const expiresAt = new Date(Date.now() + (pending2FA ? 10 * 60_000 : TTL_H * 3600_000));
  await prisma.session.create({ data: { userId, tokenHash: sha256(token), ip, userAgent, pending2FA, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadSession(allowPending = false) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!s) return null;
  const now = Date.now();
  const idle = (await prisma.companySetting.findUnique({ where: { id: 1 }, select: { sessionIdleMinutes: true } }))?.sessionIdleMinutes ?? IDLE_MIN;
  const idleExpired = now - s.lastActiveAt.getTime() > idle * 60_000;
  if (s.expiresAt.getTime() < now || (!s.pending2FA && idleExpired)) {
    await prisma.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  if (s.pending2FA && !allowPending) return null;
  if (now - s.lastActiveAt.getTime() > 60_000) {
    await prisma.session.update({ where: { id: s.id }, data: { lastActiveAt: new Date() } }).catch(() => {});
  }
  return s;
}

async function loadUser(allowPending = false) {
  const s = await loadSession(allowPending);
  if (!s) return null;
  const user = await prisma.user.findFirst({
    where: { id: s.userId, deletedAt: null, status: "ACTIVE" },
    include: { role: { include: { permissions: true } }, department: true, ebayAssignments: { select: { ebayAccountId: true } } },
  });
  if (!user) return null;
  const perms: PermissionSet = new Set(user.role.permissions.map((p) => `${p.module}:${p.action}`));
  const { passwordHash, totpSecretEnc, ...safe } = user;
  void passwordHash; void totpSecretEnc;
  return {
    ...safe,
    sessionId: s.id,
    pending2FA: s.pending2FA,
    isSuperAdmin: user.role.key === SUPER_ADMIN_KEY,
    perms,
    can: (m: Module, a: Action) => can(perms, user.role.key, m, a),
    assignedEbayAccountIds: user.ebayAssignments.map((a) => a.ebayAccountId),
  };
}

export const getCurrentUser = cache(() => loadUser(false));
export const getPendingUser = cache(() => loadUser(true));

export async function requireUser() {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** For pages: redirect to /forbidden when missing a permission. */
export async function requirePage(m: Module, a: Action = "view") {
  const u = await requireUser();
  if (!u.can(m, a)) redirect(`/forbidden?m=${m}`);
  return u;
}

/** For server actions / API routes: throw. */
export async function assertPerm(m: Module, a: Action) {
  const u = await getCurrentUser();
  if (!u) throw new ForbiddenError("Your session has expired. Please sign in again.");
  if (!u.can(m, a)) throw new ForbiddenError();
  return u;
}

/** eBay account scoping: managers see all, others only assigned accounts. */
export function ebayAccountScope(u: CurrentUser): { id?: { in: string[] } } {
  if (u.isSuperAdmin || u.can("ebay_accounts", "manage")) return {};
  return { id: { in: u.assignedEbayAccountIds } };
}
export function canAccessEbayAccount(u: CurrentUser, accountId: string) {
  return u.isSuperAdmin || u.can("ebay_accounts", "manage") || u.assignedEbayAccountIds.includes(accountId);
}
