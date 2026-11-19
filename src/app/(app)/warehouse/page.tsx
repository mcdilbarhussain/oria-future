import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { MovementType } from "@prisma/client";
import { PageHeader, Card, FilterBar, TableWrap, Badge, Stat, Pagination, Field } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { fmtDateTime, label } from "@/lib/format";
import { recordMovement, transferStock } from "../inventory/actions";
import { MovementFields } from "./fields";

export const metadata = { title: "Warehouse" };

export default async function WarehousePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("warehouse");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const from = sp.from ? new Date(sp.from) : new Date(Date.now() - 30 * 86400_000);
  const where = { createdAt: { gte: from, ...(sp.to ? { lte: new Date(sp.to + "T23:59:59") } : {}) }, ...(sp.type ? { type: sp.type as MovementType } : {}), ...(sp.wh ? { warehouseId: sp.wh } : {}), ...(sp.q ? { product: { OR: [{ sku: { contains: sp.q, mode: "insensitive" as const } }, { name: { contains: sp.q, mode: "insensitive" as const } }] } } : {}) };
  const [movements, total, products, warehouses, summary, incomingPOs] = await Promise.all([
    prisma.stockMovement.findMany({ where, include: { product: true, warehouse: true, user: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50 }),
    prisma.stockMovement.count({ where }),
    prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, sku: true, name: true }, orderBy: { sku: "asc" } }),
    prisma.warehouse.findMany({ where: { deletedAt: null } }),
    prisma.stockMovement.groupBy({ by: ["type"], where: { createdAt: { gte: from } }, _sum: { quantity: true } }),
    prisma.purchaseOrder.findMany({ where: { status: { in: ["ORDERED", "SHIPPED", "IN_TRANSIT", "CUSTOMS", "PARTIALLY_RECEIVED"] }, deletedAt: null }, include: { supplier: true }, orderBy: { eta: "asc" }, take: 5 }),
  ]);
  const s = (t: string) => Math.abs(summary.find((x) => x.type === t)?._sum.quantity ?? 0);
  return (
    <>
      <PageHeader title="Warehouse Management" subtitle="Record incoming, outgoing, damaged and returned stock. Every change is logged in the movement history." actions={<>
        {u.can("warehouse", "export") && <a className="btn-secondary" href={`/api/export/movements?format=xlsx&from=${from.toISOString().slice(0, 10)}`}>Export</a>}
        {u.can("warehouse", "edit") && warehouses.length > 1 && <ModalForm trigger="Transfer" triggerClassName="btn-secondary" title="Transfer between locations" action={transferStock}>
          <Field label="Product"><select name="productId" className="input">{products.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="From"><select name="fromId" className="input">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field><Field label="To"><select name="toId" className="input">{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field></div>
          <Field label="Quantity"><input name="quantity" type="number" min="1" className="input" /></Field><Field label="Note"><input name="note" className="input" /></Field>
        </ModalForm>}
        {u.can("warehouse", "create") && <ModalForm trigger="+ Record movement" title="Record stock movement" action={recordMovement}><MovementFields products={products} warehouses={warehouses} /></ModalForm>}
      </>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Received" value={s("IN") + s("PURCHASE_RECEIPT")} tone="green" hint="selected period" />
        <Stat label="Sold (eBay)" value={s("SALE")} />
        <Stat label="Outgoing (manual)" value={s("OUT")} tone="slate" />
        <Stat label="Damaged" value={s("DAMAGED")} tone="red" />
        <Stat label="Returned" value={s("RETURN")} tone="gold" />
      </div>
      {incomingPOs.length > 0 && (
        <Card title="Incoming shipments from suppliers" className="mb-6" padded={false}>
          <TableWrap><table className="table"><thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th>Tracking</th><th>ETA</th></tr></thead><tbody>
            {incomingPOs.map((po) => <tr key={po.id}><td><Link href={`/purchasing/orders/${po.id}`} className="link">{po.poNumber}</Link></td><td>{po.supplier.companyName}</td><td><Badge tone="blue">{label(po.status)}</Badge></td><td className="font-mono text-xs">{po.carrier} {po.trackingNumber}</td><td>{po.eta?.toLocaleDateString("en-GB") ?? "—"}</td></tr>)}
          </tbody></table></TableWrap>
        </Card>
      )}
      <FilterBar>
        <input name="q" defaultValue={sp.q} placeholder="SKU or product" className="input w-48" />
        <select name="type" defaultValue={sp.type} className="input w-44"><option value="">All types</option>{["IN", "OUT", "SALE", "DAMAGED", "RETURN", "ADJUSTMENT", "PURCHASE_RECEIPT", "TRANSFER_IN", "TRANSFER_OUT"].map((t) => <option key={t} value={t}>{label(t)}</option>)}</select>
        <select name="wh" defaultValue={sp.wh} className="input w-48"><option value="">All locations</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
        <input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className="input w-40" /><input type="date" name="to" defaultValue={sp.to} className="input w-40" />
      </FilterBar>
      <Card title="Stock movement history" padded={false}>
        <TableWrap><table className="table"><thead><tr><th>Date</th><th>SKU</th><th>Type</th><th>Location</th><th className="text-right">Qty</th><th className="text-right">Balance</th><th>Reference</th><th>By</th></tr></thead><tbody>
          {movements.map((m) => <tr key={m.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(m.createdAt)}</td><td><Link href={`/inventory/${m.productId}`} className="link font-mono text-xs">{m.product.sku}</Link></td><td><Badge tone={m.quantity > 0 ? "green" : m.type === "DAMAGED" ? "red" : "slate"}>{label(m.type)}</Badge></td><td className="text-xs">{m.warehouse.code}</td><td className={`text-right font-semibold ${m.quantity > 0 ? "text-emerald-600" : "text-red-600"}`}>{m.quantity > 0 ? "+" : ""}{m.quantity}</td><td className="text-right">{m.balanceAfter}</td><td className="max-w-xs text-xs">{m.reference} {m.note && <span className="text-slate-500">· {m.note}</span>}</td><td className="text-xs">{m.user?.name ?? "System"}</td></tr>)}
        </tbody></table></TableWrap>
        <Pagination page={page} pages={Math.ceil(total / 50)} params={sp} />
      </Card>
    </>
  );
}
