import "server-only";
import { prisma } from "./db";
import { clientInfo } from "./auth";

export async function audit(p: {
  userId?: string | null; module: string; action: string; summary: string;
  entity?: string; entityId?: string; before?: unknown; after?: unknown;
}) {
  let ip: string | null = null;
  try { ip = (await clientInfo()).ip; } catch { /* outside request scope (scheduler) */ }
  const clean = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v, (_k, val) =>
    typeof val === "string" && /hash|secret|token/i.test(_k) ? "[redacted]" : val)));
  await prisma.auditLog.create({
    data: { userId: p.userId ?? null, module: p.module, action: p.action, summary: p.summary, entity: p.entity, entityId: p.entityId, before: clean(p.before), after: clean(p.after), ip },
  });
}
