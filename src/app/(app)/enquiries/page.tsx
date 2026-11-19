import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { EnquiryStatus } from "@prisma/client";
import { PageHeader, Card, TableWrap, StatusBadge, Field, FilterBar, Empty } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { fmtDate, fmtMoney } from "@/lib/format";
import { createEnquiry } from "../suppliers/actions";

export const metadata = { title: "Supplier Price Enquiries" };

export default async function EnquiriesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const u = await requirePage("enquiries");
  const { status } = await searchParams;
  const [rows, products, users] = await Promise.all([
    prisma.priceEnquiry.findMany({ where: { ...(status ? { status: status as EnquiryStatus } : {}), ...(u.can("enquiries", "approve") || u.can("enquiries", "edit") ? {} : { requestedById: u.id }) }, include: { product: true, _count: { select: { quotations: true } } }, orderBy: { createdAt: "desc" } }),
    prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, sku: true, name: true }, orderBy: { sku: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  return (
    <>
      <PageHeader title="Supplier Price Enquiries" subtitle="Request quotations, compare supplier prices and submit purchasing recommendations." actions={u.can("enquiries", "create") && (
        <ModalForm trigger="+ New price enquiry" title="Price enquiry" action={createEnquiry}>
          <Field label="Existing product"><select name="productId" className="input"><option value="">— New / unlisted product —</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku} – {p.name}</option>)}</select></Field>
          <Field label="…or product name"><input name="productName" className="input" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Quantity"><input name="quantity" type="number" min="1" required className="input" /></Field><Field label="Target unit price"><input name="targetPrice" type="number" step="0.01" className="input" /></Field></div>
          <Field label="Notes for management"><textarea name="notes" rows={3} className="input" /></Field>
        </ModalForm>
      )} />
      <FilterBar><select name="status" defaultValue={status} className="input w-44"><option value="">All</option>{["OPEN", "QUOTING", "RECOMMENDED", "APPROVED", "REJECTED"].map((s) => <option key={s}>{s}</option>)}</select></FilterBar>
      <Card padded={false}>{rows.length === 0 ? <Empty title="No enquiries" /> : (
        <TableWrap><table className="table"><thead><tr><th>Ref</th><th>Product</th><th>Qty</th><th>Target</th><th>Quotes</th><th>Requested by</th><th>Date</th><th>Status</th></tr></thead><tbody>
          {rows.map((e) => <tr key={e.id}><td><Link href={`/enquiries/${e.id}`} className="link">{e.reference}</Link></td><td>{e.productName}{e.product && <span className="block font-mono text-xs text-slate-500">{e.product.sku}</span>}</td><td>{e.quantity}</td><td>{e.targetPrice ? fmtMoney(e.targetPrice, "USD") : "—"}</td><td>{e._count.quotations}</td><td>{users.find((x) => x.id === e.requestedById)?.name}</td><td className="text-xs">{fmtDate(e.createdAt)}</td><td><StatusBadge status={e.status} /></td></tr>)}
        </tbody></table></TableWrap>
      )}</Card>
    </>
  );
}
