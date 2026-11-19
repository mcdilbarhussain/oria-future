import Link from "next/link";
import { requirePage, ebayAccountScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, FilterBar, TableWrap, StatusBadge, DemoBadge, Stat } from "@/components/ui";
import { fmtMoney, fmtDate, label } from "@/lib/format";

export const metadata = { title: "Returns & Refunds" };

export default async function ReturnsPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const u = await requirePage("ebay_orders");
  const sp = await searchParams;
  const accounts = await prisma.ebayAccount.findMany({ where: { deletedAt: null, ...ebayAccountScope(u) }, select: { id: true, name: true } });
  const ids = sp.account && accounts.some((a) => a.id === sp.account) ? [sp.account] : accounts.map((a) => a.id);
  const [returns, refunds] = await Promise.all([
    prisma.ebayReturn.findMany({ where: { ebayAccountId: { in: ids } }, include: { ebayAccount: true }, orderBy: { openedAt: "desc" }, take: 200 }),
    prisma.ebayOrder.findMany({ where: { ebayAccountId: { in: ids }, refundedAmount: { gt: 0 } }, include: { ebayAccount: true }, orderBy: { orderedAt: "desc" }, take: 200 }),
  ]);
  const refundTotal = refunds.reduce((s, r) => s + Number(r.refundedAmount), 0);
  return (
    <>
      <PageHeader title="Returns & Refunds" subtitle="Synchronised from eBay's Post-Order (returns) and Fulfillment (refunds) APIs" />
      <div className="mb-6 grid grid-cols-3 gap-4"><Stat label="Open returns" value={returns.filter((r) => r.status !== "CLOSED").length} tone="red" /><Stat label="Total returns" value={returns.length} /><Stat label="Refunded value" value={fmtMoney(refundTotal)} tone="gold" /></div>
      <FilterBar><select name="account" defaultValue={sp.account} className="input w-56"><option value="">All my accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></FilterBar>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Returns" padded={false}>
          <TableWrap><table className="table"><thead><tr><th>Return</th><th>Account</th><th>Buyer</th><th>Reason</th><th>Refund</th><th>Opened</th><th>Status</th></tr></thead><tbody>
            {returns.map((r) => <tr key={r.id}><td className="font-mono text-xs">{r.returnId} <DemoBadge show={r.isDemo} /></td><td className="text-xs">{r.ebayAccount.name}</td><td>{r.buyerUsername}</td><td className="text-xs">{label(r.reason)}</td><td>{r.refundAmount ? fmtMoney(r.refundAmount, r.currency) : "—"}</td><td className="text-xs">{fmtDate(r.openedAt)}</td><td><StatusBadge status={r.status} /></td></tr>)}
          </tbody></table></TableWrap>
        </Card>
        <Card title="Refunded orders" padded={false}>
          <TableWrap><table className="table"><thead><tr><th>Order</th><th>Account</th><th>Buyer</th><th className="text-right">Refunded</th><th>Status</th></tr></thead><tbody>
            {refunds.map((o) => <tr key={o.id}><td><Link href={`/ebay/orders/${o.id}`} className="link font-mono text-xs">{o.orderId}</Link></td><td className="text-xs">{o.ebayAccount.name}</td><td>{o.buyerUsername}</td><td className="text-right text-red-600">{fmtMoney(o.refundedAmount, o.currency)}</td><td><StatusBadge status={o.paymentStatus} /></td></tr>)}
          </tbody></table></TableWrap>
        </Card>
      </div>
    </>
  );
}
