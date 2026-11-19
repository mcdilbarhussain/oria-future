import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { PurchaseRequestStatus, POStatus } from "@prisma/client";
import { PageHeader, Card, TableWrap, StatusBadge, Field, Empty, Badge } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { fmtDate, fmtMoney } from "@/lib/format";
import { createPurchaseRequest, createManualPO } from "./actions";
import { lowStockProducts } from "@/lib/queries";

export const metadata = { title: "Purchasing" };

export default async function PurchasingPage({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; new?: string }> }) {
  const u = await requirePage("purchasing");
  const sp = await searchParams;
  const tab = sp.tab === "orders" ? "orders" : "requests";
  const [requests, orders, products, suppliers, low, users] = await Promise.all([
    prisma.purchaseRequest.findMany({ where: sp.status && tab === "requests" ? { status: sp.status as PurchaseRequestStatus } : {}, include: { product: true, purchaseOrder: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.purchaseOrder.findMany({ where: { deletedAt: null, ...(sp.status && tab === "orders" ? { status: sp.status as POStatus } : {}) }, include: { supplier: true, items: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, sku: true, name: true, reorderQty: true }, orderBy: { sku: "asc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true } }),
    lowStockProducts(10),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const preset = sp.new ? products.find((p) => p.id === sp.new) : undefined;
  return (
    <>
      <PageHeader title="Stock Purchasing & Procurement" subtitle="Low stock → request → management review → quotations → finance review → approval → PO → shipment → receipt → inventory." actions={<>
        {u.can("purchasing", "manage") && <ModalForm trigger="Manual PO" triggerClassName="btn-secondary" title="Create purchase order directly" action={createManualPO}>
          <Field label="Supplier"><select name="supplierId" required className="input">{suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}</select></Field>
          <Field label="Product"><select name="productId" required className="input">{products.map((p) => <option key={p.id} value={p.id}>{p.sku} – {p.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><input name="quantity" type="number" min="1" required className="input" /></Field><Field label="Unit cost"><input name="unitCost" type="number" step="0.01" required className="input" /></Field><Field label="Shipping"><input name="shippingCost" type="number" step="0.01" defaultValue={0} className="input" /></Field><Field label="Currency"><select name="currency" className="input"><option>USD</option><option>CNY</option><option>GBP</option></select></Field></div>
          <Field label="Notes"><textarea name="notes" className="input" /></Field>
        </ModalForm>}
        {u.can("purchasing", "create") && <ModalForm trigger={preset ? `Request ${preset.sku}` : "+ Purchase request"} title="New stock purchase request" action={createPurchaseRequest}>
          <Field label="Product"><select name="productId" required defaultValue={preset?.id} className="input"><option value="">Select…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} – {p.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><input name="quantity" type="number" min="1" required defaultValue={preset?.reorderQty} className="input" /></Field><Field label="Priority"><select name="priority" defaultValue="MEDIUM" className="input"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></Field></div>
          <Field label="Reason"><textarea name="reason" rows={3} className="input" placeholder="e.g. below reorder level, seasonal demand…" /></Field>
        </ModalForm>}
      </>} />
      {low.length > 0 && u.can("purchasing", "create") && (
        <Card title="Step 1 – Low stock identified" className="mb-6" padded={false}>
          <div className="flex flex-wrap gap-2 p-4">{low.map((p) => <Link key={p.id} href={`/purchasing?new=${p.id}`} className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800 hover:bg-red-100"><b className="font-mono">{p.sku}</b> · {p.qty} left → request</Link>)}</div>
        </Card>
      )}
      <div className="mb-4 flex gap-2">
        <Link href="?tab=requests" className={tab === "requests" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Purchase requests ({requests.length})</Link>
        <Link href="?tab=orders" className={tab === "orders" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Purchase orders ({orders.length})</Link>
        {u.can("purchasing", "export") && <a href={`/api/export/purchases?format=xlsx`} className="btn-secondary btn-sm ml-auto">Export history</a>}
      </div>
      {tab === "requests" ? (
        <Card padded={false}>{requests.length === 0 ? <Empty title="No purchase requests" /> : (
          <TableWrap><table className="table"><thead><tr><th>Ref</th><th>Product</th><th>Qty</th><th>Priority</th><th>Requested by</th><th>Estimated cost</th><th>Date</th><th>Status</th></tr></thead><tbody>
            {requests.map((r) => <tr key={r.id}><td><Link className="link" href={`/purchasing/requests/${r.id}`}>{r.reference}</Link></td><td><span className="font-mono text-xs">{r.product.sku}</span><p className="text-xs text-slate-500">{r.product.name}</p></td><td>{r.quantity}</td><td><StatusBadge status={r.priority} /></td><td>{users.find((x) => x.id === r.requestedById)?.name}</td><td>{r.estimatedCost ? fmtMoney(r.estimatedCost, r.currency) : "—"}</td><td className="text-xs">{fmtDate(r.createdAt)}</td><td><StatusBadge status={r.status} />{r.purchaseOrder && <Link href={`/purchasing/orders/${r.purchaseOrder.id}`} className="ml-1 text-xs text-navy-600">{r.purchaseOrder.poNumber}</Link>}</td></tr>)}
          </tbody></table></TableWrap>
        )}</Card>
      ) : (
        <Card padded={false}>{orders.length === 0 ? <Empty title="No purchase orders" /> : (
          <TableWrap><table className="table"><thead><tr><th>PO</th><th>Supplier</th><th>Items</th><th className="text-right">Total</th><th>Tracking</th><th>ETA</th><th>Status</th></tr></thead><tbody>
            {orders.map((o) => <tr key={o.id}><td><Link className="link" href={`/purchasing/orders/${o.id}`}>{o.poNumber}</Link> {o.isDemo && <Badge tone="gold">DEMO</Badge>}</td><td>{o.supplier.companyName}</td><td>{o.items.reduce((s, i) => s + i.quantity, 0)} units</td><td className="text-right">{fmtMoney(o.total, o.currency)}</td><td className="font-mono text-xs">{o.trackingNumber ?? "—"}</td><td>{fmtDate(o.eta)}</td><td><StatusBadge status={o.status} /></td></tr>)}
          </tbody></table></TableWrap>
        )}</Card>
      )}
    </>
  );
}
