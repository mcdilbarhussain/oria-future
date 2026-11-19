import Link from "next/link";
import { requirePage, ebayAccountScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { PageHeader, Card, FilterBar, TableWrap, StatusBadge, DemoBadge, Pagination, Badge, Empty } from "@/components/ui";
import { fmtMoney, fmtDateTime } from "@/lib/format";

export const metadata = { title: "eBay Orders" };
const PER = 50;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("ebay_orders");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const accounts = await prisma.ebayAccount.findMany({ where: { deletedAt: null, ...ebayAccountScope(u) }, select: { id: true, name: true } });
  const ids = accounts.map((a) => a.id);
  const where: Prisma.EbayOrderWhereInput = {
    ebayAccountId: sp.account && ids.includes(sp.account) ? sp.account : { in: ids },
    ...(sp.status === "awaiting" ? { dispatchedAt: null, paymentStatus: "PAID" } : sp.status === "dispatched" ? { dispatchedAt: { not: null } } : sp.status === "refunded" ? { refundedAmount: { gt: 0 } } : {}),
    ...(sp.q ? { OR: [{ orderId: { contains: sp.q, mode: "insensitive" } }, { buyerUsername: { contains: sp.q, mode: "insensitive" } }, { items: { some: { OR: [{ sku: { contains: sp.q, mode: "insensitive" } }, { title: { contains: sp.q, mode: "insensitive" } }] } } }] } : {}),
    orderedAt: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to + "T23:59:59") } : {}) },
  };
  const [orders, total, agg] = await Promise.all([
    prisma.ebayOrder.findMany({ where, include: { ebayAccount: true, items: true }, orderBy: { orderedAt: "desc" }, skip: (page - 1) * PER, take: PER }),
    prisma.ebayOrder.count({ where }),
    prisma.ebayOrder.aggregate({ where, _sum: { total: true } }),
  ]);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
  return (
    <>
      <PageHeader title="eBay Orders" subtitle={`${total} orders · ${fmtMoney(agg._sum.total ?? 0)}`} actions={u.can("ebay_orders", "export") && <><a className="btn-secondary" href={`/api/export/orders?format=xlsx&${qs}`}>Excel</a><a className="btn-secondary" href={`/api/export/orders?format=csv&${qs}`}>CSV</a></>} />
      <FilterBar>
        <input name="q" defaultValue={sp.q} placeholder="Order ID, buyer, SKU…" className="input w-56" />
        <select name="account" defaultValue={sp.account} className="input w-56"><option value="">All my accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select name="status" defaultValue={sp.status} className="input w-44"><option value="">All orders</option><option value="awaiting">Awaiting dispatch</option><option value="dispatched">Dispatched</option><option value="refunded">Refunded</option></select>
        <input type="date" name="from" defaultValue={sp.from} className="input w-40" /><input type="date" name="to" defaultValue={sp.to} className="input w-40" />
      </FilterBar>
      <Card padded={false}>
        {orders.length === 0 ? <Empty title="No orders found" /> : (
          <TableWrap><table className="table"><thead><tr><th>Order</th><th>Account</th><th>Buyer</th><th>Items</th><th className="text-right">Total</th><th>Payment</th><th>Dispatch</th><th>Date</th></tr></thead><tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td><Link href={`/ebay/orders/${o.id}`} className="link font-mono text-xs">{o.orderId}</Link> <DemoBadge show={o.isDemo} /></td>
                <td className="text-xs">{o.ebayAccount.name}</td>
                <td>{o.buyerUsername}<p className="text-xs text-slate-500">{o.shipToCity} {o.shipToPostcode}</p></td>
                <td className="max-w-xs text-xs">{o.items.map((i) => <p key={i.id} className="line-clamp-1">{i.quantity}× {i.sku ?? i.title}</p>)}</td>
                <td className="text-right font-semibold">{fmtMoney(o.total, o.currency)}{Number(o.refundedAmount) > 0 && <p className="text-xs text-red-600">−{fmtMoney(o.refundedAmount)}</p>}</td>
                <td><StatusBadge status={o.paymentStatus} /></td>
                <td>{o.dispatchedAt ? <Badge tone="green">Dispatched</Badge> : <Badge tone={o.dispatchBy && o.dispatchBy < new Date() ? "red" : "amber"}>Awaiting{o.dispatchBy && o.dispatchBy < new Date() ? " – late" : ""}</Badge>}</td>
                <td className="whitespace-nowrap text-xs">{fmtDateTime(o.orderedAt)}</td>
              </tr>
            ))}
          </tbody></table></TableWrap>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER)} params={sp} />
      </Card>
    </>
  );
}
