import "server-only";
import { prisma } from "./db";
import { notify, usersWithPermission } from "./notify";
import { syncAllAccounts } from "./ebay/sync";

/** Periodic background jobs. Safe to run concurrently-ish (idempotent updates). */
export async function runScheduledJobs(opts: { ebay?: boolean } = { ebay: true }) {
  const now = new Date();
  const result: Record<string, number> = {};

  // 1. Overdue tasks
  const overdue = await prisma.task.findMany({ where: { deletedAt: null, dueDate: { lt: now }, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS"] } } });
  for (const t of overdue) {
    await prisma.task.update({ where: { id: t.id }, data: { status: "OVERDUE" } });
    await notify([t.assigneeId, t.createdById].filter(Boolean) as string[], { type: "TASK_OVERDUE", title: `Task overdue: ${t.title}`, link: `/tasks/${t.id}` });
  }
  result.overdueTasks = overdue.length;

  // 2. Deadline approaching (within 24h) – one reminder per task
  const soon = await prisma.task.findMany({ where: { deletedAt: null, reminderSentAt: null, assigneeId: { not: null }, dueDate: { gte: now, lte: new Date(now.getTime() + 86400_000) }, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS"] } } });
  for (const t of soon) {
    await prisma.task.update({ where: { id: t.id }, data: { reminderSentAt: now } });
    await notify([t.assigneeId!], { type: "TASK_DEADLINE", title: `Deadline approaching: ${t.title}`, body: `Due ${t.dueDate!.toLocaleString("en-GB")}`, link: `/tasks/${t.id}` });
  }
  result.deadlineReminders = soon.length;

  // 3. Orders past their dispatch-by date (summary at most every 6 hours)
  const lastAlert = await prisma.auditLog.findFirst({ where: { module: "system", action: "dispatch_alert" }, orderBy: { createdAt: "desc" } });
  if (!lastAlert || now.getTime() - lastAlert.createdAt.getTime() > 6 * 3600_000) {
    const late = await prisma.ebayOrder.count({ where: { dispatchedAt: null, paymentStatus: "PAID", dispatchBy: { lt: now } } });
    if (late) {
      await notify(await usersWithPermission("ebay_orders", "edit"), { type: "ORDER_AWAITING_DISPATCH", title: `${late} order(s) past dispatch deadline`, link: "/ebay/orders?status=awaiting" });
      await prisma.auditLog.create({ data: { module: "system", action: "dispatch_alert", summary: `${late} late orders alerted` } });
    }
    result.lateOrders = late;
  }

  // 4. eBay synchronisation for connected (non-demo) accounts
  if (opts.ebay) result.ebayAccountsSynced = await syncAllAccounts();

  // 5. Housekeeping
  result.expiredSessions = (await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } })).count;
  await prisma.ebayOAuthState.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - 7 * 86400_000) } } });

  await prisma.auditLog.create({ data: { module: "system", action: "scheduler", summary: `scheduled jobs: ${JSON.stringify(result)}` } });
  return result;
}
