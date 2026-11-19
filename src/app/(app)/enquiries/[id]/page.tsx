import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, KV, StatusBadge, TableWrap, Badge, Field } from "@/components/ui";
import { ActionForm, ModalForm, SubmitButton } from "@/components/forms";
import { fmtMoney, fmtDate } from "@/lib/format";
import { quoteTotal } from "@/lib/workflows/purchasing";
import { addQuotation, recommendQuote, decideEnquiry } from "../../suppliers/actions";
import { QuoteFields } from "../../suppliers/fields";

export default async function EnquiryDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("enquiries");
  const { id } = await params;
  const e = await prisma.priceEnquiry.findUnique({ where: { id }, include: { product: true, quotations: { include: { supplier: true }, orderBy: { unitPrice: "asc" } } } });
  if (!e) notFound();
  if (!(u.can("enquiries", "approve") || u.can("enquiries", "edit")) && e.requestedById !== u.id) notFound();
  const [suppliers, users] = await Promise.all([prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true } }), prisma.user.findMany({ select: { id: true, name: true } })]);
  const totals = e.quotations.map((q) => ({ q, total: quoteTotal({ unitPrice: Number(q.unitPrice), shippingCost: Number(q.shippingCost), moq: q.moq }, e.quantity) }));
  const best = [...totals].sort((a, b) => a.total - b.total)[0];
  const open = !["APPROVED", "REJECTED"].includes(e.status);
  return (
    <>
      <PageHeader back={{ href: "/enquiries", label: "Price enquiries" }} title={`${e.reference} · ${e.productName}`} subtitle={<StatusBadge status={e.status} />} actions={open && u.can("enquiries", "edit") && (
        <ModalForm trigger="+ Upload supplier quotation" title="Supplier quotation" action={addQuotation} wide><QuoteFields suppliers={suppliers} hidden={{ enquiryId: id }} /></ModalForm>
      )} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Enquiry">
          <KV items={[["Product", e.product ? <Link className="link" href={`/inventory/${e.product.id}`}>{e.product.sku}</Link> : e.productName], ["Quantity", e.quantity], ["Target unit price", e.targetPrice ? fmtMoney(e.targetPrice, "USD") : "—"], ["Requested by", users.find((x) => x.id === e.requestedById)?.name], ["Date", fmtDate(e.createdAt)], ["Reviewed by", e.reviewedById ? users.find((x) => x.id === e.reviewedById)?.name : "—"]]} />
          {e.notes && <p className="mt-3 text-sm text-slate-600">{e.notes}</p>}
          {e.recommendation && <div className="mt-4 rounded-lg bg-purple-50 p-3 text-sm"><p className="font-semibold text-purple-800">Purchasing recommendation</p><p className="text-purple-900">{e.recommendation}</p></div>}
          {e.reviewNote && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">Management: {e.reviewNote}</p>}
        </Card>
        <Card title="Supplier price comparison" padded={false} className="lg:col-span-2">
          <TableWrap><table className="table"><thead><tr><th>Supplier</th><th className="text-right">Unit</th><th className="text-right">MOQ</th><th className="text-right">Shipping</th><th className="text-right">Landed total</th><th className="text-right">Per unit</th><th>Lead</th><th>File</th></tr></thead><tbody>
            {totals.map(({ q, total }) => (
              <tr key={q.id} className={best?.q.id === q.id ? "bg-emerald-50/60" : ""}>
                <td><Link className="link" href={`/suppliers/${q.supplierId}`}>{q.supplier.companyName}</Link> {best?.q.id === q.id && <Badge tone="green">Best price</Badge>} {e.recommendedQuotationId === q.id && <Badge tone="purple">Recommended</Badge>}</td>
                <td className="text-right">{fmtMoney(q.unitPrice, q.currency)}</td><td className="text-right">{q.moq}</td><td className="text-right">{fmtMoney(q.shippingCost, q.currency)}</td>
                <td className="text-right font-semibold">{fmtMoney(total, q.currency)}</td><td className="text-right text-xs">{fmtMoney(total / Math.max(e.quantity, q.moq), q.currency)}</td><td>{q.leadTimeDays ? `${q.leadTimeDays}d` : "—"}</td>
                <td>{q.fileId ? <a className="link text-xs" href={`/api/files/${q.fileId}`} target="_blank">View</a> : "—"}</td>
              </tr>
            ))}
            {!totals.length && <tr><td colSpan={8} className="py-6 text-center text-slate-500">No quotations yet</td></tr>}
          </tbody></table></TableWrap>
          {open && totals.length > 0 && u.can("enquiries", "edit") && (
            <ActionForm action={recommendQuote} className="grid gap-3 border-t p-4 sm:grid-cols-3">
              <input type="hidden" name="id" value={id} />
              <Field label="Recommended quotation"><select name="quotationId" defaultValue={best?.q.id} className="input">{totals.map(({ q }) => <option key={q.id} value={q.id}>{q.supplier.companyName} – {fmtMoney(q.unitPrice, q.currency)}</option>)}</select></Field>
              <Field label="Recommendation" className="sm:col-span-2"><input name="recommendation" required className="input" placeholder="Why this supplier?" /></Field>
              <div><SubmitButton className="btn-primary btn-sm">Submit recommendation</SubmitButton></div>
            </ActionForm>
          )}
          {open && u.can("enquiries", "approve") && (
            <ActionForm action={decideEnquiry} className="flex flex-wrap items-end gap-2 border-t p-4">
              <input type="hidden" name="id" value={id} />
              <Field label="Management decision note" className="flex-1"><input name="note" className="input" /></Field>
              <button name="status" value="APPROVED" className="btn-gold">Approve purchase</button>
              <button name="status" value="REJECTED" className="btn-danger">Reject</button>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
