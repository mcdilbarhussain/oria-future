import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { salesSeries, lowStockProducts, stockValue, financeTotals } from "@/lib/queries";
import { Card, PageHeader, Stat, StatusBadge, Badge, Empty, TableWrap } from "@/components/ui";
import { AreaTrend, Bars } from "@/components/charts";
import { fmtMoney, fmtNum, fmtDate, timeAgo } from "@/lib/format";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const u = await requireUser();
  const c = u.can;
  const scope = u.isSuperAdmin || c("ebay_accounts", "manage") ? undefined : u.assignedEbayAccountIds;
  const accWhere = scope ? { ebayAccountId: { in: scope } } : {};
  const startMonth = new Date(); startMonth.setDate(1); startMonth.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [myTasks, taskCounts, series, todayOrders, awaitingDispatch, unreadMsgs, lowStock, stock, fin, pendingPR, pendingTx, accounts, recentAudit, accountSales, pendingReqs] = await Promise.all([
    prisma.task.findMany({ where: { assigneeId: u.id, deletedAt: null, status: { notIn: ["COMPLETED"] } }, orderBy: [{ dueDate: "asc" }], take: 6 }),
    c("tasks", "manage") || c("tasks", "approve") ? prisma.task.groupBy({ by: ["status"], where: { deletedAt: null }, _count: true }) : Promise.resolve([]),
    c("ebay_orders", "view") ? salesSeries(30, scope) : Promise.resolve([]),
    c("ebay_orders", "view") ? prisma.ebayOrder.aggregate({ where: { ...accWhere, orderedAt: { gte: today } }, _count: true, _sum: { total: true } }) : null,
    c("ebay_orders", "view") ? prisma.ebayOrder.count({ where: { ...accWhere, dispatchedAt: null, paymentStatus: "PAID" } }) : 0,
    c("buyer_messages", "view") ? prisma.buyerMessageThread.count({ where: { ...accWhere, unread: true } }) : 0,
    c("inventory", "view") ? lowStockProducts(6) : Promise.resolve([]),
    c("inventory", "view") ? stockValue() : null,
    c("finance", "view") ? financeTotals(startMonth, new Date()) : null,
    c("purchasing", "view") ? prisma.purchaseRequest.count({ where: { status: { notIn: ["RECEIVED", "REJECTED", "CANCELLED", "ORDERED"] } } }) : 0,
    c("finance", "approve") ? prisma.transaction.count({ where: { status: "PENDING_APPROVAL", deletedAt: null } }) : 0,
    c("ebay_accounts", "view") ? prisma.ebayAccount.findMany({ where: { deletedAt: null, ...(scope ? { id: { in: scope } } : {}) }, orderBy: { name: "asc" } }) : Promise.resolve([]),
    c("activity_logs", "view") ? prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }) : Promise.resolve([]),
    c("ebay_orders", "view") ? prisma.ebayOrder.groupBy({ by: ["ebayAccountId"], where: { ...accWhere, orderedAt: { gte: startMonth } }, _sum: { total: true }, _count: true }) : Promise.resolve([]),
    c("requests", "approve") ? prisma.approvalRequest.count({ where: { status: "PENDING" } }) : 0,
  ]);
  const accName = Object.fromEntries(accounts.map((a) => [a.id, a.name]));
  const hour = new Date().getHours();

  return (
    <>
      <PageHeader title={`Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${u.name.split(" ")[0]}`} subtitle={<>{u.role.name}{u.department ? ` · ${u.department.name}` : ""} · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {todayOrders && <Stat label="Orders today" value={fmtNum(todayOrders._count)} hint={fmtMoney(todayOrders._sum.total)} href="/ebay/orders" />}
        {c("ebay_orders", "view") && <Stat label="Awaiting dispatch" value={fmtNum(awaitingDispatch)} tone={awaitingDispatch ? "gold" : "green"} href="/ebay/orders?status=awaiting" />}
        {c("buyer_messages", "view") && <Stat label="Unread buyer messages" value={fmtNum(unreadMsgs)} tone={unreadMsgs ? "red" : "green"} href="/ebay/messages" />}
        {stock && <Stat label="Stock value (cost)" value={fmtMoney(stock.value)} hint={`${fmtNum(stock.units)} units`} tone="navy" href="/inventory" />}
        {fin && <Stat label="Revenue this month" value={fmtMoney(fin.income)} hint="Actual, approved" tone="green" href="/finance" />}
        {fin && <Stat label="Net profit this month" value={fmtMoney(fin.profit)} hint={`Estimated incl. forecasts: ${fmtMoney(fin.estIncome - fin.estExpense)}`} tone={fin.profit >= 0 ? "green" : "red"} href="/finance" />}
        {c("purchasing", "view") && <Stat label="Open purchase requests" value={pendingPR} tone="gold" href="/purchasing" />}
        {c("inventory", "view") && <Stat label="Low-stock SKUs" value={lowStock.length} tone={lowStock.length ? "red" : "green"} href="/inventory?filter=low" />}
        {c("finance", "approve") && <Stat label="Payments awaiting approval" value={pendingTx} tone={pendingTx ? "gold" : "green"} href="/finance/transactions?status=PENDING_APPROVAL" />}
        {c("requests", "approve") && <Stat label="Pending requests" value={pendingReqs} tone={pendingReqs ? "gold" : "green"} href="/requests" />}
        <Stat label="My open tasks" value={myTasks.length} tone="slate" href="/tasks?mine=1" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {series.length > 0 && (
          <Card title="eBay sales – last 30 days" className="xl:col-span-2" actions={<Link href="/reports" className="text-xs font-semibold text-navy-600 hover:underline">Reports →</Link>}>
            <AreaTrend data={series} keys={[{ key: "revenue", label: "Revenue" }]} />
          </Card>
        )}
        <Card title="My tasks" actions={<Link href="/tasks?mine=1" className="text-xs font-semibold text-navy-600 hover:underline">All →</Link>} padded={false}>
          {myTasks.length === 0 ? <Empty title="No open tasks">You&apos;re all caught up.</Empty> : (
            <ul className="divide-y">
              {myTasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0"><Link href={`/tasks/${t.id}`} className="block truncate text-sm font-medium hover:text-navy-600">{t.title}</Link><p className="text-xs text-slate-500">Due {fmtDate(t.dueDate)}</p></div>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {accounts.length > 0 && (
          <Card title="eBay accounts" padded={false} actions={<Link href="/ebay/accounts" className="text-xs font-semibold text-navy-600 hover:underline">Manage →</Link>}>
            <ul className="divide-y">
              {accounts.map((a) => {
                const s = accountSales.find((x) => x.ebayAccountId === a.id);
                return (
                  <li key={a.id} className="flex items-center justify-between px-4 py-3">
                    <div><Link href={`/ebay/accounts/${a.id}`} className="text-sm font-medium hover:text-navy-600">{a.name}</Link><p className="text-xs text-slate-500">{s?._count ?? 0} orders · {fmtMoney(s?._sum.total ?? 0)} this month</p></div>
                    <div className="flex gap-1">{a.isDemo && <Badge tone="gold">DEMO</Badge>}<StatusBadge status={a.status} /></div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        {accountSales.length > 0 && (
          <Card title="Account-wise sales (month to date)">
            <Bars data={accountSales.map((s) => ({ label: (accName[s.ebayAccountId] ?? "?").replace(" (DEMO)", ""), revenue: Number(s._sum.total ?? 0) }))} keys={[{ key: "revenue", label: "Revenue" }]} height={220} />
          </Card>
        )}
        {c("inventory", "view") && (
          <Card title="Low stock alerts" padded={false} actions={<Link href="/inventory?filter=low" className="text-xs font-semibold text-navy-600 hover:underline">View →</Link>}>
            {lowStock.length === 0 ? <Empty title="Stock levels healthy" /> : (
              <TableWrap><table className="table"><thead><tr><th>SKU</th><th>Qty</th><th>Reorder</th></tr></thead><tbody>
                {lowStock.map((p) => <tr key={p.id}><td><Link className="link" href={`/inventory/${p.id}`}>{p.sku}</Link><p className="text-xs text-slate-500">{p.name}</p></td><td className="font-semibold text-red-600">{p.qty}</td><td>{p.reorderLevel}</td></tr>)}
              </tbody></table></TableWrap>
            )}
          </Card>
        )}
        {taskCounts.length > 0 && (
          <Card title="Team task overview">
            <div className="grid grid-cols-2 gap-3">
              {taskCounts.map((t) => <Link key={t.status} href={`/tasks?status=${t.status}`} className="rounded-lg border border-slate-100 p-3 hover:bg-slate-50"><StatusBadge status={t.status} /><p className="mt-1 text-xl font-bold">{t._count}</p></Link>)}
            </div>
          </Card>
        )}
        {recentAudit.length > 0 && (
          <Card title="Recent activity" padded={false} actions={<Link href="/activity-logs" className="text-xs font-semibold text-navy-600 hover:underline">Logs →</Link>} className="xl:col-span-2">
            <ul className="divide-y">
              {recentAudit.map((l) => <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"><span><span className="font-medium">{l.user?.name ?? "System"}</span> <span className="text-slate-600">{l.summary}</span></span><span className="shrink-0 text-xs text-slate-400">{timeAgo(l.createdAt)}</span></li>)}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
