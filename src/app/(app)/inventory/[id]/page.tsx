import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, KV, Badge, StatusBadge, TableWrap, Stat, DemoBadge } from "@/components/ui";
import { ActionButton, ModalForm } from "@/components/forms";
import { fmtMoney, fmtDateTime, label } from "@/lib/format";
import { saveProduct, archiveProduct, recordMovement } from "../actions";
import { ProductFields } from "../fields";
import { MovementFields } from "../../warehouse/fields";

export default async function ProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("inventory");
  const { id } = await params;
  const p = await prisma.product.findFirst({ where: { id, deletedAt: null }, include: { preferredSupplier: true, stock: { include: { warehouse: true } }, supplierProducts: { include: { supplier: true } }, listings: { where: { deletedAt: null }, include: { ebayAccount: true } } } });
  if (!p) notFound();
  const [movements, suppliers, warehouses, sold30] = await Promise.all([
    prisma.stockMovement.findMany({ where: { productId: id }, include: { user: true, warehouse: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true } }),
    prisma.warehouse.findMany({ where: { deletedAt: null } }),
    prisma.stockMovement.aggregate({ where: { productId: id, type: "SALE", createdAt: { gte: new Date(Date.now() - 30 * 86400_000) } }, _sum: { quantity: true } }),
  ]);
  const total = p.stock.reduce((s, x) => s + x.quantity, 0);
  const velocity = -(sold30._sum.quantity ?? 0) / 30;
  return (
    <>
      <PageHeader back={{ href: "/inventory", label: "Inventory" }} title={p.name} subtitle={<span className="flex items-center gap-2 font-mono">{p.sku} <DemoBadge show={p.isDemo} /></span>} actions={<>
        {u.can("warehouse", "create") && <ModalForm trigger="Record stock movement" title={`Stock movement – ${p.sku}`} action={recordMovement}><MovementFields products={[{ id: p.id, sku: p.sku, name: p.name }]} warehouses={warehouses} /></ModalForm>}
        {u.can("purchasing", "create") && <Link href={`/purchasing?new=${p.id}`} className="btn-gold">Create purchase request</Link>}
        {u.can("inventory", "edit") && <ModalForm trigger="Edit" triggerClassName="btn-secondary" title="Edit product" action={saveProduct} wide><ProductFields p={p} suppliers={suppliers} /></ModalForm>}
        {u.can("inventory", "delete") && <ActionButton action={archiveProduct} fields={{ id }} className="btn-ghost text-red-600" confirm="Archive this product?">Archive</ActionButton>}
      </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total stock" value={total} tone={total <= p.reorderLevel ? "red" : "green"} hint={`Reorder at ${p.reorderLevel}`} />
        <Stat label="Sales velocity" value={`${velocity.toFixed(1)}/day`} hint="last 30 days" />
        <Stat label="Days of cover" value={velocity > 0 ? Math.floor(total / velocity) : "∞"} tone="gold" />
        <Stat label="Unit margin" value={fmtMoney(Number(p.sellPrice) - Number(p.costPrice))} hint={`${fmtMoney(p.costPrice)} → ${fmtMoney(p.sellPrice)}`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Product details" className="lg:col-span-2">
          <KV items={[["Barcode", <span key="b" className="font-mono">{p.barcode}</span>], ["Category", p.category], ["Brand", p.brand], ["Weight", p.weightKg ? `${p.weightKg} kg` : null], ["Preferred supplier", p.preferredSupplier ? <Link className="link" href={`/suppliers/${p.preferredSupplier.id}`}>{p.preferredSupplier.companyName}</Link> : null], ["Reorder quantity", p.reorderQty]]} />
          {p.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{p.description}</p>}
        </Card>
        <Card title="Stock by location" padded={false}>
          <ul className="divide-y text-sm">{p.stock.map((s) => <li key={s.id} className="flex justify-between px-4 py-2.5"><span>{s.warehouse.name}<span className="block text-xs text-slate-500">Bin {s.binLocation ?? "—"}</span></span><b>{s.quantity}</b></li>)}</ul>
        </Card>
        <Card title="eBay listings" padded={false}>
          <ul className="divide-y text-sm">{p.listings.map((l) => <li key={l.id} className="flex items-center justify-between px-4 py-2.5"><Link href={`/ebay/listings/${l.id}`} className="link">{l.ebayAccount.name}</Link><span className="flex items-center gap-2">{fmtMoney(l.price)} · {l.quantity} <StatusBadge status={l.status} /></span></li>)}{!p.listings.length && <li className="px-4 py-3 text-slate-500">Not listed</li>}</ul>
        </Card>
        <Card title="Supplier prices" padded={false} className="lg:col-span-2">
          <TableWrap><table className="table"><thead><tr><th>Supplier</th><th>Unit price</th><th>MOQ</th><th>Shipping/unit</th><th>Lead time</th></tr></thead><tbody>
            {p.supplierProducts.map((s) => <tr key={s.id}><td><Link className="link" href={`/suppliers/${s.supplierId}`}>{s.supplier.companyName}</Link></td><td>{fmtMoney(s.unitPrice, s.currency)}</td><td>{s.moq}</td><td>{s.shippingCostPerUnit ? fmtMoney(s.shippingCostPerUnit, s.currency) : "—"}</td><td>{s.leadTimeDays ? `${s.leadTimeDays} days` : "—"}</td></tr>)}
          </tbody></table></TableWrap>
        </Card>
        <Card title="Stock movement history" padded={false} className="lg:col-span-3">
          <TableWrap><table className="table"><thead><tr><th>Date</th><th>Type</th><th>Location</th><th className="text-right">Qty</th><th className="text-right">Balance</th><th>Reference</th><th>By</th></tr></thead><tbody>
            {movements.map((m) => <tr key={m.id}><td className="text-xs">{fmtDateTime(m.createdAt)}</td><td><Badge tone={m.quantity > 0 ? "green" : m.type === "DAMAGED" ? "red" : "slate"}>{label(m.type)}</Badge></td><td className="text-xs">{m.warehouse.code}</td><td className={`text-right font-semibold ${m.quantity > 0 ? "text-emerald-600" : "text-red-600"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td><td className="text-right">{m.balanceAfter}</td><td className="text-xs">{m.reference}{m.note && <span className="block text-slate-500">{m.note}</span>}</td><td className="text-xs">{m.user?.name ?? "System"}</td></tr>)}
          </tbody></table></TableWrap>
        </Card>
      </div>
    </>
  );
}
