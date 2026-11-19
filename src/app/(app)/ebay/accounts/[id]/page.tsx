import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage, canAccessEbayAccount } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { salesSeries } from "@/lib/queries";
import { PageHeader, Card, Stat, StatusBadge, KV, Badge, TableWrap, Field, Avatar } from "@/components/ui";
import { ActionButton, ModalForm } from "@/components/forms";
import { AreaTrend } from "@/components/charts";
import { fmtMoney, fmtDateTime, fmtDate } from "@/lib/format";
import { ebayAccountOp, disconnectEbayAccount, updateEbayAccount } from "../../actions";

export default async function EbayAccountDashboard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; connected?: string }> }) {
  const u = await requirePage("ebay_accounts");
  const { id } = await params;
  const sp = await searchParams;
  if (!canAccessEbayAccount(u, id)) notFound();
  const a = await prisma.ebayAccount.findFirst({ where: { id, deletedAt: null }, include: { assignments: { include: { user: true } } } });
  if (!a) notFound();
  const som = new Date(); som.setDate(1); som.setHours(0, 0, 0, 0);
  const [series, mtd, awaiting, listings, unread, returns, logs, topItems, fees] = await Promise.all([
    salesSeries(30, [id]),
    prisma.ebayOrder.aggregate({ where: { ebayAccountId: id, orderedAt: { gte: som } }, _sum: { total: true }, _count: true }),
    prisma.ebayOrder.count({ where: { ebayAccountId: id, dispatchedAt: null, paymentStatus: "PAID" } }),
    prisma.ebayListing.groupBy({ by: ["status"], where: { ebayAccountId: id, deletedAt: null }, _count: true }),
    prisma.buyerMessageThread.count({ where: { ebayAccountId: id, unread: true } }),
    prisma.ebayReturn.count({ where: { ebayAccountId: id, status: { notIn: ["CLOSED"] } } }),
    prisma.syncLog.findMany({ where: { ebayAccountId: id }, orderBy: { startedAt: "desc" }, take: 12 }),
    prisma.$queryRaw<{ sku: string; title: string; qty: number; revenue: number }[]>`SELECT i.sku, MAX(i.title) title, SUM(i.quantity)::int qty, SUM(i.quantity*i."unitPrice")::float revenue FROM "EbayOrderItem" i JOIN "EbayOrder" o ON o.id=i."orderId" WHERE o."ebayAccountId"=${id} AND o."orderedAt">=${new Date(Date.now() - 30 * 86400_000)} GROUP BY i.sku ORDER BY revenue DESC LIMIT 5`,
    prisma.ebayOrder.aggregate({ where: { ebayAccountId: id, orderedAt: { gte: som } }, _sum: { fees: true, refundedAmount: true } }),
  ]);
  const lc = (s: string) => listings.find((l) => l.status === s)?._count ?? 0;
  const perf = a.performance as { standardsProfiles?: { program?: string; standardsLevel?: string; cycle?: { cycleType?: string }; metrics?: { name?: string; level?: string; value?: unknown }[] }[] } | null;
  const manage = u.can("ebay_accounts", "manage");
  return (
    <>
      <PageHeader back={{ href: "/ebay/accounts", label: "eBay accounts" }} title={a.name} subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={a.status} />{a.isDemo && <Badge tone="gold">DEMO – sample data, not connected to eBay</Badge>}{a.ebayUsername} · {a.marketplaceId} · {a.environment}</span>} actions={<>
        {(u.can("ebay_accounts", "edit") || u.can("ebay_orders", "edit")) && <ActionButton action={ebayAccountOp} fields={{ id, op: "sync" }} className="btn-primary" pendingText="Syncing…">Sync now</ActionButton>}
        {manage && !a.isDemo && <a href={`/api/ebay/oauth/start?account=${id}`} className="btn-gold">{a.status === "CONNECTED" ? "Re-authorise" : "Connect with eBay"}</a>}
        {manage && !a.isDemo && <ActionButton action={ebayAccountOp} fields={{ id, op: "test" }} className="btn-secondary">Test connection</ActionButton>}
        {manage && !a.isDemo && <ActionButton action={ebayAccountOp} fields={{ id, op: "policies" }} className="btn-secondary">Load policies</ActionButton>}
        {manage && !a.isDemo && <ActionButton action={ebayAccountOp} fields={{ id, op: "performance" }} className="btn-secondary">Refresh performance</ActionButton>}
        {manage && a.status === "CONNECTED" && !a.isDemo && <ActionButton action={disconnectEbayAccount} fields={{ id }} className="btn-danger" confirm="Disconnect this account? Stored OAuth tokens will be deleted.">Disconnect</ActionButton>}
      </>} />
      {sp.error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{sp.error}</p>}
      {sp.connected && <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">Account authorised with eBay. An initial sync has been started – check the sync log below.</p>}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Stat label="Sales MTD" value={fmtMoney(mtd._sum.total ?? 0)} tone="green" href={`/ebay/orders?account=${id}`} />
        <Stat label="Orders MTD" value={mtd._count} href={`/ebay/orders?account=${id}`} />
        <Stat label="Awaiting dispatch" value={awaiting} tone={awaiting ? "gold" : "green"} href={`/ebay/orders?account=${id}&status=awaiting`} />
        <Stat label="Active / unsold" value={`${lc("ACTIVE")} / ${lc("ENDED") + lc("OUT_OF_STOCK")}`} href={`/ebay/listings?account=${id}`} />
        <Stat label="Unread messages" value={unread} tone={unread ? "red" : "green"} href={`/ebay/messages?account=${id}`} />
        <Stat label="Open returns" value={returns} tone={returns ? "red" : "slate"} href={`/ebay/returns?account=${id}`} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Sales – last 30 days" className="xl:col-span-2"><AreaTrend data={series} keys={[{ key: "revenue", label: "Revenue" }]} height={230} /></Card>
        <Card title="Account health & performance">
          {perf?.standardsProfiles?.length ? (
            <div className="space-y-3 text-sm">{perf.standardsProfiles.map((p, i) => <div key={i}><p className="font-semibold">{p.program} · {p.cycle?.cycleType}: <Badge tone={p.standardsLevel === "TOP_RATED" ? "green" : p.standardsLevel === "ABOVE_STANDARD" ? "blue" : "red"}>{p.standardsLevel}</Badge></p><ul className="mt-1 text-xs text-slate-600">{p.metrics?.slice(0, 5).map((m, j) => <li key={j}>{m.name}: {m.level}</li>)}</ul></div>)}<p className="text-xs text-slate-400">Updated {fmtDateTime(a.performanceAt)} (Sell Analytics API)</p></div>
          ) : (
            <div className="text-sm text-slate-600">
              <KV items={[["Fees MTD", fmtMoney(fees._sum.fees ?? 0)], ["Refunds MTD", fmtMoney(fees._sum.refundedAmount ?? 0)], ["Late dispatch risk", `${awaiting} order(s) not yet dispatched`]]} />
              <p className="mt-3 text-xs text-slate-400">{a.isDemo ? "Seller standards data is only available for connected accounts." : "Click “Refresh performance” to load seller standards from eBay's Analytics API."}</p>
            </div>
          )}
        </Card>
        <Card title="Top products (30 days)" padded={false}>
          <TableWrap><table className="table"><thead><tr><th>SKU</th><th className="text-right">Qty</th><th className="text-right">Revenue</th></tr></thead><tbody>{topItems.map((t) => <tr key={t.sku}><td><span className="font-mono text-xs">{t.sku}</span><p className="line-clamp-1 text-xs text-slate-500">{t.title}</p></td><td className="text-right">{t.qty}</td><td className="text-right">{fmtMoney(t.revenue)}</td></tr>)}</tbody></table></TableWrap>
        </Card>
        <Card title="Connection" actions={manage && (
          <ModalForm trigger="Edit" triggerClassName="btn-secondary btn-sm" title="Account settings & listing policies" action={updateEbayAccount}>
            <input type="hidden" name="id" value={id} />
            <Field label="Name"><input name="name" defaultValue={a.name} className="input" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fulfilment policy ID"><input name="fulfillmentPolicyId" defaultValue={a.fulfillmentPolicyId ?? ""} className="input" /></Field>
              <Field label="Payment policy ID"><input name="paymentPolicyId" defaultValue={a.paymentPolicyId ?? ""} className="input" /></Field>
              <Field label="Return policy ID"><input name="returnPolicyId" defaultValue={a.returnPolicyId ?? ""} className="input" /></Field>
              <Field label="Inventory location key"><input name="merchantLocationKey" defaultValue={a.merchantLocationKey ?? ""} className="input" /></Field>
            </div>
            <Field label="Notes"><textarea name="notes" defaultValue={a.notes ?? ""} className="input" /></Field>
          </ModalForm>
        )}>
          <KV items={[["Status", <StatusBadge key="s" status={a.status} />], ["Connected", fmtDate(a.connectedAt)], ["Access token expires", fmtDateTime(a.accessTokenExpiresAt)], ["Refresh token expires", fmtDate(a.refreshTokenExpiresAt)], ["Last sync", fmtDateTime(a.lastSyncAt)], ["Policies", a.fulfillmentPolicyId && a.paymentPolicyId && a.returnPolicyId ? "Configured" : "Not set"]]} />
          <p className="mt-3 text-xs text-slate-500">Tokens are encrypted (AES-256-GCM) on the server and never sent to the browser.</p>
          {a.lastSyncError && <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">{a.lastSyncError}</p>}
        </Card>
        <Card title="Assigned employees" padded={false} actions={manage && <span className="text-xs text-slate-500">Assign via Employees → employee</span>}>
          <ul className="divide-y">{a.assignments.map((x) => <li key={x.id} className="flex items-center gap-2 px-4 py-2 text-sm"><Avatar name={x.user.name} color={x.user.avatarColor} size={24} /><Link href={`/employees/${x.userId}`} className="hover:underline">{x.user.name}</Link></li>)}{!a.assignments.length && <li className="px-4 py-3 text-sm text-slate-500">Only managers can access this account.</li>}</ul>
        </Card>
        <Card title="Sync log" padded={false} className="xl:col-span-3">
          <TableWrap><table className="table"><thead><tr><th>Started</th><th>Kind</th><th>Status</th><th>Items</th><th>Message</th></tr></thead><tbody>
            {logs.map((l) => <tr key={l.id}><td className="text-xs">{fmtDateTime(l.startedAt)}</td><td>{l.kind}</td><td><StatusBadge status={l.status} /></td><td>{l.itemsProcessed}</td><td className="max-w-xl text-xs text-slate-600">{l.message}</td></tr>)}
            {!logs.length && <tr><td colSpan={5} className="py-4 text-center text-slate-500">No sync runs yet</td></tr>}
          </tbody></table></TableWrap>
        </Card>
      </div>
    </>
  );
}
