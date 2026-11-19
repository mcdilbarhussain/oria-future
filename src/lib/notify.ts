import "server-only";
import { prisma } from "./db";
import { publish } from "./events";
import type { Action, Module } from "./permissions";
import { can } from "./permissions";

export async function notify(userIds: string[], n: { type: string; title: string; body?: string; link?: string }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  await prisma.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })) });
  await publish({ kind: "notification", userIds: ids, ...n });
}

/** Find active users holding a permission (e.g. everyone who can approve purchasing). */
export async function usersWithPermission(m: Module, a: Action, extraWhere: object = {}) {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: "ACTIVE", ...extraWhere },
    select: { id: true, role: { select: { key: true, permissions: { select: { module: true, action: true } } } } },
  });
  return users.filter((u) => can(new Set(u.role.permissions.map((p) => `${p.module}:${p.action}`)), u.role.key, m, a)).map((u) => u.id);
}

export async function notifyPermission(m: Module, a: Action, n: { type: string; title: string; body?: string; link?: string }, exclude?: string) {
  const ids = (await usersWithPermission(m, a)).filter((id) => id !== exclude);
  await notify(ids, n);
}
