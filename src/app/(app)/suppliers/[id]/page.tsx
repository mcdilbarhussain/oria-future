import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, KV, Badge, TableWrap, StatusBadge, DemoBadge, Field, Stat } from "@/components/ui";
import { ActionButton, ActionForm, ModalForm, SubmitButton } from "@/components/forms";
import { fmtMoney, fmtDate, fmtDateTime, label } from "@/lib/format";
import { saveSupplier, archiveSupplier, saveSupplierProduct, addReview, logCommunication } from "../actions";
import { SupplierFields } from "../fields";

export default async function SupplierDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("suppliers");
  const { id } = await params;
  const s = await prisma.supplier.findFirst({ where: { id, deletedAt: null }, include: { products: { include: { product: true }, orderBy: { name: "asc" } }, reviews: { include: { user: true }, orderBy: { createdAt: "desc" } }, communications: { orderBy: { occurredAt: "desc" }, take: 20 }, quotations: { include: { enquiry: true, purchaseRequest: true }, orderBy: { createdAt: "desc" }, take: 20 }, purchaseOrders: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } } } });
  if (!s) notFound();
  const [products, files, users, paid] = await Promise.all([
    prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, sku: true, name: true } }),
    prisma.fileAsset.findMany({ where: { entityType: "supplier", entityId: id }, orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    u.can("finance", "view") ? prisma.transaction.aggregate({ where: { supplierId: id, type: "EXPENSE", deletedAt: null, isEstimated: false }, _sum: { amount: true } }) : null,
  ]);
  const uname = (uid: string) => users.find((x) => x.id === uid)?.name ?? "—";
  const edit = u.can("suppliers", "edit");
  return (
    <>
      <PageHeader back={{ href: "/suppliers", label: "Suppliers" }} title={s.companyName} subtitle={<span className="flex items-center gap-2">{[s.city, s.province, s.country].filter(Boolean).join(", ")} <DemoBadge show={s.isDemo} /></span>} actions={<>
        {edit && <ModalForm trigger="Edit" triggerClassName="btn-secondary" title="Edit supplier" action={saveSupplier} wide><SupplierFields s={s} /></ModalForm>}
        {u.can("suppliers", "delete") && <ActionButton action={archiveSupplier} fields={{ id }} className="btn-ghost text-red-600" confirm="Archive this supplier?">Archive</ActionButton>}
      </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Rating" value={s.rating ? `★ ${s.rating}` : "—"} tone="gold" hint={`${s.reviews.length} internal reviews`} />
        <Stat label="Purchase orders" value={s.purchaseOrders.length} />
        <Stat label="Quotations" value={s.quotations.length} />
        {paid && <Stat label="Total paid (actual)" value={fmtMoney(paid._sum.amount ?? 0)} tone="green" />}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Supplier profile" className="lg:col-span-2">
          <KV items={[["Contact person", s.contactPerson], ["Email", s.email && <a className="link" href={`mailto:${s.email}`}>{s.email}</a>], ["Phone", s.phone], ["WeChat", s.wechat], ["Website", s.website], ["Payment terms", s.paymentTerms], ["Currency", s.currency], ["Typical shipping", s.defaultShippingCost ? fmtMoney(s.defaultShippingCost, s.currency) : null], ["Categories", <span key="c" className="flex flex-wrap gap-1">{s.categories.map((c) => <Badge key={c}>{c}</Badge>)}</span>]]} />
          {s.notes && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{s.notes}</p>}
        </Card>
        <Card title="Internal reviews" padded={false}>
          {edit && <ActionForm action={addReview} className="flex flex-wrap items-end gap-2 border-b p-3"><input type="hidden" name="supplierId" value={id} /><select name="rating" className="input w-20"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select><input name="comment" placeholder="Comment" className="input flex-1" /><SubmitButton className="btn-secondary btn-sm">Add</SubmitButton></ActionForm>}
          <ul className="max-h-64 divide-y overflow-y-auto text-sm">{s.reviews.map((r) => <li key={r.id} className="px-4 py-2.5"><p><span className="text-gold-600">{"★".repeat(r.rating)}</span> <span className="text-xs text-slate-500">{r.user.name} · {fmtDate(r.createdAt)}</span></p><p className="text-slate-600">{r.comment}</p></li>)}</ul>
        </Card>
        <Card title="Product catalogue & prices" padded={false} className="lg:col-span-3" actions={edit && (
          <ModalForm trigger="+ Catalogue item" triggerClassName="btn-secondary btn-sm" title="Add supplier product" action={saveSupplierProduct}>
            <input type="hidden" name="supplierId" value={id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Linked SKU (optional)" className="sm:col-span-2"><select name="productId" className="input"><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} – {p.name}</option>)}</select></Field>
              <Field label="Product name" className="sm:col-span-2"><input name="name" required className="input" /></Field>
              <Field label="Supplier SKU"><input name="supplierSku" className="input" /></Field>
              <Field label="Unit price"><input name="unitPrice" type="number" step="0.01" required className="input" /></Field>
              <Field label="Currency"><select name="currency" defaultValue={s.currency} className="input"><option>USD</option><option>CNY</option><option>GBP</option><option>EUR</option></select></Field>
              <Field label="MOQ"><input name="moq" type="number" min="1" defaultValue={100} className="input" /></Field>
              <Field label="Shipping cost / unit"><input name="shippingCostPerUnit" type="number" step="0.01" className="input" /></Field>
              <Field label="Lead time (days)"><input name="leadTimeDays" type="number" className="input" /></Field>
            </div>
          </ModalForm>
        )}>
          <TableWrap><table className="table"><thead><tr><th>Product</th><th>Our SKU</th><th>Supplier SKU</th><th className="text-right">Unit price</th><th className="text-right">MOQ</th><th className="text-right">Ship/unit</th><th>Lead time</th><th>Updated</th></tr></thead><tbody>
            {s.products.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.product ? <Link className="link font-mono text-xs" href={`/inventory/${p.product.id}`}>{p.product.sku}</Link> : "—"}</td><td className="font-mono text-xs">{p.supplierSku ?? "—"}</td><td className="text-right">{fmtMoney(p.unitPrice, p.currency)}</td><td className="text-right">{p.moq}</td><td className="text-right">{p.shippingCostPerUnit ? fmtMoney(p.shippingCostPerUnit, p.currency) : "—"}</td><td>{p.leadTimeDays ? `${p.leadTimeDays}d` : "—"}</td><td className="text-xs">{fmtDate(p.updatedAt)}</td></tr>)}
          </tbody></table></TableWrap>
        </Card>
        <Card title="Quotations" padded={false} className="lg:col-span-2">
          <TableWrap><table className="table"><thead><tr><th>Date</th><th>For</th><th className="text-right">Unit</th><th>MOQ</th><th className="text-right">Shipping</th><th>File</th></tr></thead><tbody>
            {s.quotations.map((q) => <tr key={q.id}><td className="text-xs">{fmtDate(q.createdAt)}</td><td>{q.enquiry ? <Link className="link" href={`/enquiries/${q.enquiry.id}`}>{q.enquiry.reference}</Link> : q.purchaseRequest ? <Link className="link" href={`/purchasing/requests/${q.purchaseRequest.id}`}>{q.purchaseRequest.reference}</Link> : "—"}</td><td className="text-right">{fmtMoney(q.unitPrice, q.currency)}</td><td>{q.moq}</td><td className="text-right">{fmtMoney(q.shippingCost, q.currency)}</td><td>{q.fileId ? <a className="link text-xs" href={`/api/files/${q.fileId}`}>View</a> : "—"}</td></tr>)}
          </tbody></table></TableWrap>
        </Card>
        <Card title="Order history" padded={false}>
          <ul className="divide-y text-sm">{s.purchaseOrders.map((po) => <li key={po.id} className="flex items-center justify-between px-4 py-2.5"><Link href={`/purchasing/orders/${po.id}`} className="link">{po.poNumber}</Link><span className="flex items-center gap-2 text-xs">{fmtMoney(po.total, po.currency)} <StatusBadge status={po.status} /></span></li>)}{!s.purchaseOrders.length && <li className="px-4 py-3 text-slate-500">No orders yet</li>}</ul>
        </Card>
        <Card title="Communication records" padded={false} className="lg:col-span-3" actions={edit && (
          <ModalForm trigger="+ Log communication" triggerClassName="btn-secondary btn-sm" title="Log supplier communication" action={logCommunication}>
            <input type="hidden" name="supplierId" value={id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Channel"><select name="channel" className="input"><option>WECHAT</option><option>EMAIL</option><option>PHONE</option><option>ALIBABA</option><option>MEETING</option><option>OTHER</option></select></Field>
              <Field label="Date"><input name="occurredAt" type="datetime-local" className="input" /></Field>
              <Field label="Subject" className="sm:col-span-2"><input name="subject" className="input" /></Field>
              <Field label="Summary" className="sm:col-span-2"><textarea name="summary" required rows={4} className="input" /></Field>
              <Field label="Attachments" className="sm:col-span-2"><input name="files" type="file" multiple className="input" /></Field>
            </div>
          </ModalForm>
        )}>
          <ul className="divide-y text-sm">{s.communications.map((c) => <li key={c.id} className="px-4 py-3"><p className="font-medium"><Badge>{label(c.channel)}</Badge> {c.subject} <span className="text-xs font-normal text-slate-500">· {uname(c.userId)} · {fmtDateTime(c.occurredAt)}</span></p><p className="mt-1 whitespace-pre-wrap text-slate-600">{c.summary}</p></li>)}</ul>
          {files.length > 0 && <div className="border-t px-4 py-3 text-sm"><p className="label">Attachments</p>{files.map((f) => <a key={f.id} href={`/api/files/${f.id}`} className="link mr-3">{f.filename}</a>)}</div>}
        </Card>
      </div>
    </>
  );
}
