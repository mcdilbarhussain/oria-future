import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, KV, StatusBadge, TableWrap, DemoBadge, Field } from "@/components/ui";
import { ActionForm, ModalForm, SubmitButton } from "@/components/forms";
import { fmtMoney, fmtDate } from "@/lib/format";
import { updatePOShipment, receivePO } from "../../actions";

export default async function PODetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("purchasing");
  const { id } = await params;
  const po = await prisma.purchaseOrder.findFirst({ where: { id, deletedAt: null }, include: { supplier: true, warehouse: true, purchaseRequest: true, items: { include: { product: true } } } });
  if (!po) notFound();
  const payments = u.can("finance", "view") ? await prisma.transaction.findMany({ where: { purchaseOrderId: id, deletedAt: null } }) : [];
  const receivable = !["RECEIVED", "CANCELLED", "DRAFT"].includes(po.status) && u.can("warehouse", "edit");
  return (
    <>
      <PageHeader back={{ href: "/purchasing?tab=orders", label: "Purchase orders" }} title={`Purchase order ${po.poNumber}`} subtitle={<span className="flex items-center gap-2"><StatusBadge status={po.status} /><DemoBadge show={po.isDemo} /> {po.supplier.companyName}</span>} actions={<>
        <a href={`/api/export/po/${po.id}`} className="btn-secondary">Download PDF</a>
        {u.can("purchasing", "edit") && !["RECEIVED"].includes(po.status) && (
          <ModalForm trigger="Update shipment" title="Shipment tracking" action={updatePOShipment}>
            <input type="hidden" name="id" value={id} />
            <Field label="Status"><select name="status" defaultValue={po.status} className="input">{["DRAFT", "ORDERED", "SHIPPED", "IN_TRANSIT", "CUSTOMS", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Carrier / forwarder"><input name="carrier" defaultValue={po.carrier ?? ""} className="input" /></Field><Field label="Tracking / container no."><input name="trackingNumber" defaultValue={po.trackingNumber ?? ""} className="input" /></Field></div>
            <Field label="ETA"><input name="eta" type="date" defaultValue={po.eta?.toISOString().slice(0, 10)} className="input" /></Field>
            <Field label="Notes"><textarea name="notes" defaultValue={po.notes ?? ""} className="input" /></Field>
          </ModalForm>
        )}
      </>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Order details">
          <KV items={[["Supplier", <Link key="s" className="link" href={`/suppliers/${po.supplierId}`}>{po.supplier.companyName}</Link>], ["Deliver to", po.warehouse.name], ["From request", po.purchaseRequest ? <Link key="r" className="link" href={`/purchasing/requests/${po.purchaseRequest.id}`}>{po.purchaseRequest.reference}</Link> : "Manual"], ["Ordered", fmtDate(po.orderedAt)], ["Shipped", fmtDate(po.shippedAt)], ["ETA", fmtDate(po.eta)], ["Received", fmtDate(po.receivedAt)], ["Carrier", po.carrier], ["Tracking", <span key="t" className="font-mono">{po.trackingNumber}</span>], ["Payment terms", po.supplier.paymentTerms]]} />
          {po.notes && <p className="mt-3 text-sm text-slate-600">{po.notes}</p>}
        </Card>
        <Card title="Items" padded={false} className="lg:col-span-2">
          <ActionForm action={receivePO}>
            <input type="hidden" name="id" value={id} />
            <TableWrap><table className="table"><thead><tr><th>SKU</th><th>Product</th><th className="text-right">Ordered</th><th className="text-right">Unit cost</th><th className="text-right">Line</th><th className="text-right">Received</th>{receivable && <><th>Receive now</th><th>Damaged</th></>}</tr></thead><tbody>
              {po.items.map((i) => <tr key={i.id}><td className="font-mono text-xs">{i.product.sku}</td><td>{i.product.name}</td><td className="text-right">{i.quantity}</td><td className="text-right">{fmtMoney(i.unitCost, po.currency)}</td><td className="text-right">{fmtMoney(Number(i.unitCost) * i.quantity, po.currency)}</td><td className="text-right">{i.receivedQty}</td>
                {receivable && <><td><input name={`qty_${i.id}`} type="number" min="0" defaultValue={Math.max(0, i.quantity - i.receivedQty)} className="input w-24" /></td><td><input name={`dmg_${i.id}`} type="number" min="0" defaultValue={0} className="input w-20" /></td></>}</tr>)}
            </tbody>
            <tfoot className="text-sm"><tr><td colSpan={4} className="px-3 py-2 text-right text-slate-500">Subtotal</td><td className="px-3 py-2 text-right">{fmtMoney(po.subtotal, po.currency)}</td></tr><tr><td colSpan={4} className="px-3 py-1 text-right text-slate-500">Shipping</td><td className="px-3 py-1 text-right">{fmtMoney(po.shippingCost, po.currency)}</td></tr><tr><td colSpan={4} className="px-3 py-2 text-right font-semibold">Total</td><td className="px-3 py-2 text-right font-bold">{fmtMoney(po.total, po.currency)}</td></tr></tfoot>
            </table></TableWrap>
            {receivable && <div className="border-t p-4"><SubmitButton className="btn-gold" confirm="Confirm receipt? Inventory will be updated immediately.">Steps 10–11 · Confirm receipt & update inventory</SubmitButton></div>}
          </ActionForm>
        </Card>
        {payments.length > 0 && (
          <Card title="Linked finance records" padded={false} className="lg:col-span-3">
            <TableWrap><table className="table"><thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Type</th><th>Payment</th></tr></thead><tbody>
              {payments.map((t) => <tr key={t.id}><td>{fmtDate(t.date)}</td><td>{t.description}</td><td>{fmtMoney(t.amount, t.currency)}</td><td>{t.isEstimated ? <StatusBadge status="PENDING" /> : <StatusBadge status="APPROVED" />} {t.isEstimated ? "Estimated" : "Actual"}</td><td><StatusBadge status={t.paymentStatus} /></td></tr>)}
            </tbody></table></TableWrap>
          </Card>
        )}
      </div>
    </>
  );
}
