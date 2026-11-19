import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, KV, StatusBadge, TableWrap, Badge, Field } from "@/components/ui";
import { ActionButton, ModalForm } from "@/components/forms";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { nextSteps, PR_STEPS, PR_TIMELINE, quoteTotal, type PRStatus } from "@/lib/workflows/purchasing";
import { advancePR, generatePO } from "../../actions";
import { addQuotation } from "../../../suppliers/actions";
import { QuoteFields } from "../../../suppliers/fields";
import clsx from "clsx";

export default async function PRDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("purchasing");
  const { id } = await params;
  const pr = await prisma.purchaseRequest.findUnique({ where: { id }, include: { product: { include: { stock: true } }, quotations: { include: { supplier: true } }, purchaseOrder: true } });
  if (!pr) notFound();
  const suppliers = await prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true } });
  const steps = nextSteps(pr.status as PRStatus).filter((s) => s !== "receive" && s !== "add_quotation" && (u.can(...PR_STEPS[s].perm) || (s === "reject" && u.can("finance", "approve") && ["QUOTED", "FINANCE_REVIEWED"].includes(pr.status))));
  const history = (pr.history as { at: string; by: string; status: string; note?: string }[]) ?? [];
  const idx = PR_TIMELINE.indexOf(pr.status as PRStatus);
  const totals = pr.quotations.map((q) => ({ q, total: quoteTotal({ unitPrice: Number(q.unitPrice), shippingCost: Number(q.shippingCost), moq: q.moq }, pr.quantity) })).sort((a, b) => a.total - b.total);
  const stock = pr.product.stock.reduce((s, x) => s + x.quantity, 0);
  return (
    <>
      <PageHeader back={{ href: "/purchasing", label: "Purchasing" }} title={`${pr.reference} · ${pr.product.sku} × ${pr.quantity}`} subtitle={<span className="flex items-center gap-2"><StatusBadge status={pr.status} /><StatusBadge status={pr.priority} /></span>} actions={<>
        {["QUOTATION_REQUESTED", "QUOTED"].includes(pr.status) && u.can("purchasing", "edit") && <ModalForm trigger="Step 4 · Upload supplier quotation" title="Supplier quotation" action={addQuotation} wide><QuoteFields suppliers={suppliers} hidden={{ purchaseRequestId: id }} /></ModalForm>}
        {steps.map((s) => s === "finance_review" ? (
          <ModalForm key={s} trigger="Step 5 · Finance review" triggerClassName="btn-gold" title="Finance review of estimated cost" action={advancePR} submitLabel="Confirm review">
            <input type="hidden" name="id" value={id} /><input type="hidden" name="step" value={s} />
            <Field label="Selected quotation"><select name="quotationId" defaultValue={totals[0]?.q.id} className="input">{totals.map(({ q, total }) => <option key={q.id} value={q.id}>{q.supplier.companyName} – total {fmtMoney(total, q.currency)}</option>)}</select></Field>
            <div className="grid grid-cols-2 gap-3"><Field label="Estimated landed cost"><input name="estimatedCost" type="number" step="0.01" required defaultValue={totals[0]?.total} className="input" /></Field><Field label="Currency"><select name="currency" defaultValue={totals[0]?.q.currency ?? "GBP"} className="input"><option>GBP</option><option>USD</option><option>EUR</option><option>CNY</option></select></Field></div>
            <Field label="Finance note (budget, cash flow)"><textarea name="note" rows={2} className="input" /></Field>
          </ModalForm>
        ) : s === "create_po" ? (
          <ActionButton key={s} action={generatePO} fields={{ id }} className="btn-gold">Step 7 · Generate purchase order</ActionButton>
        ) : (
          <ModalForm key={s} trigger={PR_STEPS[s].label} triggerClassName={s === "reject" ? "btn-danger" : s === "cancel" ? "btn-secondary" : "btn-primary"} title={PR_STEPS[s].label} action={advancePR} submitLabel="Confirm">
            <input type="hidden" name="id" value={id} /><input type="hidden" name="step" value={s} />
            <Field label={s === "reject" ? "Reason (required)" : "Note"}><textarea name="note" rows={3} required={s === "reject"} className="input" /></Field>
          </ModalForm>
        ))}
      </>} />
      <Card className="mb-6">
        <ol className="flex flex-wrap gap-y-3">
          {PR_TIMELINE.map((s, i) => (
            <li key={s} className="flex items-center">
              <span className={clsx("flex h-7 items-center rounded-full px-3 text-xs font-semibold", pr.status === "REJECTED" || pr.status === "CANCELLED" ? "bg-slate-100 text-slate-400" : i < idx ? "bg-emerald-100 text-emerald-800" : i === idx ? "bg-navy-800 text-white" : "bg-slate-100 text-slate-500")}>{i + 1}. {s.replace(/_/g, " ").toLowerCase()}</span>
              {i < PR_TIMELINE.length - 1 && <span className="mx-1 h-px w-4 bg-slate-300" />}
            </li>
          ))}
        </ol>
        {(pr.status === "REJECTED" || pr.status === "CANCELLED") && <p className="mt-3 text-sm text-red-700">This request was {pr.status.toLowerCase()}{pr.rejectionReason ? `: ${pr.rejectionReason}` : ""}.</p>}
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Request">
          <KV items={[["Product", <Link key="p" className="link" href={`/inventory/${pr.product.id}`}>{pr.product.sku}</Link>], ["Current stock", `${stock} (reorder at ${pr.product.reorderLevel})`], ["Quantity", pr.quantity], ["Estimated cost", pr.estimatedCost ? fmtMoney(pr.estimatedCost, pr.currency) : "—"], ["Purchase order", pr.purchaseOrder ? <Link key="po" className="link" href={`/purchasing/orders/${pr.purchaseOrder.id}`}>{pr.purchaseOrder.poNumber}</Link> : "—"]]} />
          {pr.reason && <p className="mt-3 text-sm text-slate-600">{pr.reason}</p>}
          {pr.financeNote && <p className="mt-3 rounded-lg bg-purple-50 p-3 text-sm text-purple-900">Finance: {pr.financeNote}</p>}
        </Card>
        <Card title="Quotations" padded={false} className="lg:col-span-2">
          <TableWrap><table className="table"><thead><tr><th>Supplier</th><th className="text-right">Unit</th><th>MOQ</th><th className="text-right">Shipping</th><th className="text-right">Total</th><th>Lead</th><th>File</th></tr></thead><tbody>
            {totals.map(({ q, total }, i) => <tr key={q.id}><td>{q.supplier.companyName} {i === 0 && <Badge tone="green">Cheapest</Badge>} {pr.selectedQuotationId === q.id && <Badge tone="purple">Selected</Badge>}</td><td className="text-right">{fmtMoney(q.unitPrice, q.currency)}</td><td>{q.moq}</td><td className="text-right">{fmtMoney(q.shippingCost, q.currency)}</td><td className="text-right font-semibold">{fmtMoney(total, q.currency)}</td><td>{q.leadTimeDays ?? "—"}d</td><td>{q.fileId ? <a href={`/api/files/${q.fileId}`} className="link text-xs">View</a> : "—"}</td></tr>)}
            {!totals.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">No quotations yet</td></tr>}
          </tbody></table></TableWrap>
        </Card>
        <Card title="Approval history" padded={false} className="lg:col-span-3">
          <ul className="divide-y text-sm">{history.map((h, i) => <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5"><span><StatusBadge status={h.status} /> <b className="ml-1">{h.by}</b>{h.note && <span className="text-slate-600"> — {h.note}</span>}</span><span className="text-xs text-slate-500">{fmtDateTime(h.at)}</span></li>)}</ul>
        </Card>
      </div>
    </>
  );
}
