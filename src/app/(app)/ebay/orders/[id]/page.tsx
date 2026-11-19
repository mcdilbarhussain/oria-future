import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage, canAccessEbayAccount } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, KV, StatusBadge, TableWrap, DemoBadge, Field } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { dispatchOrder } from "../../actions";

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("ebay_orders");
  const { id } = await params;
  const o = await prisma.ebayOrder.findUnique({ where: { id }, include: { ebayAccount: true, items: true } });
  if (!o || !canAccessEbayAccount(u, o.ebayAccountId)) notFound();
  const returns = await prisma.ebayReturn.findMany({ where: { ebayAccountId: o.ebayAccountId, orderId: o.orderId } });
  return (
    <>
      <PageHeader back={{ href: "/ebay/orders", label: "Orders" }} title={`Order ${o.orderId}`} subtitle={<span className="flex items-center gap-2">{o.ebayAccount.name} · {fmtDateTime(o.orderedAt)} <DemoBadge show={o.isDemo} /></span>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Items" padded={false} className="lg:col-span-2">
          <TableWrap><table className="table"><thead><tr><th>SKU</th><th>Title</th><th className="text-right">Qty</th><th className="text-right">Unit</th><th className="text-right">Line</th></tr></thead><tbody>
            {o.items.map((i) => <tr key={i.id}><td>{i.productId ? <Link className="link font-mono text-xs" href={`/inventory/${i.productId}`}>{i.sku}</Link> : <span className="font-mono text-xs">{i.sku ?? "—"}</span>}</td><td>{i.title}</td><td className="text-right">{i.quantity}</td><td className="text-right">{fmtMoney(i.unitPrice, o.currency)}</td><td className="text-right">{fmtMoney(Number(i.unitPrice) * i.quantity, o.currency)}</td></tr>)}
          </tbody></table></TableWrap>
          <div className="border-t p-4"><KV items={[["Delivery", fmtMoney(o.deliveryCost, o.currency)], ["Order total", <b key="t">{fmtMoney(o.total, o.currency)}</b>], ["eBay fees", o.fees ? fmtMoney(o.fees, o.currency) : "Not yet available"], ["Refunded", fmtMoney(o.refundedAmount, o.currency)]]} /></div>
        </Card>
        <div className="space-y-6">
          <Card title="Buyer & delivery"><KV items={[["Buyer", o.buyerUsername], ["Name", o.buyerName], ["Ship to", [o.shipToCity, o.shipToPostcode, o.shipToCountry].filter(Boolean).join(", ")]]} /><p className="mt-3 text-xs text-slate-400">Buyer details are limited to what eBay&apos;s Fulfillment API returns for your authorised scopes.</p></Card>
          <Card title="Payment & fulfilment">
            <KV items={[["Payment", <StatusBadge key="p" status={o.paymentStatus} />], ["Fulfilment", <StatusBadge key="f" status={o.orderStatus} />], ["Dispatch by", fmtDateTime(o.dispatchBy)], ["Dispatched", fmtDateTime(o.dispatchedAt)], ["Carrier", o.carrier], ["Tracking", o.trackingNumber]]} />
            {!o.dispatchedAt && u.can("ebay_orders", "edit") && (
              <ActionForm action={dispatchOrder} className="mt-4 space-y-2 border-t pt-4">
                <input type="hidden" name="id" value={o.id} />
                <Field label="Carrier code"><select name="carrier" className="input"><option value="Royal Mail">Royal Mail</option><option value="Parcelforce">Parcelforce</option><option value="DPD">DPD</option><option value="Evri">Evri</option><option value="UPS">UPS</option><option value="DHL">DHL</option><option value="Yodel">Yodel</option></select></Field>
                <Field label="Tracking number"><input name="tracking" required className="input" /></Field>
                <SubmitButton className="btn-primary w-full">Mark dispatched{o.ebayAccount.isDemo ? " (demo – local only)" : " & upload tracking to eBay"}</SubmitButton>
              </ActionForm>
            )}
          </Card>
          {returns.length > 0 && <Card title="Returns">{returns.map((r) => <p key={r.id} className="text-sm">{r.returnId}: {r.reason} <StatusBadge status={r.status} /> {r.refundAmount && fmtMoney(r.refundAmount)}</p>)}</Card>}
        </div>
      </div>
    </>
  );
}
