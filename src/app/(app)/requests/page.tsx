import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Field, StatusBadge, Badge, TableWrap, Empty } from "@/components/ui";
import { ActionForm, ModalForm } from "@/components/forms";
import { fmtDate, fmtDateTime, fmtMoney, label } from "@/lib/format";
import { createRequest, reviewRequest, submitDailyReport } from "./actions";

export const metadata = { title: "Requests & Reports" };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requirePage("requests");
  const { tab = "mine" } = await searchParams;
  const canQueue = u.can("requests", "approve") || u.can("finance", "approve");
  const managerView = u.can("tasks", "manage") || u.can("departments", "manage");
  const queueTypes = [...(u.can("requests", "approve") ? ["ASSISTANCE", "GENERAL"] : []), ...(u.can("finance", "approve") ? ["BALANCE_ENQUIRY", "FINANCE"] : [])];
  const [mine, queue, reports] = await Promise.all([
    prisma.approvalRequest.findMany({ where: { requestedById: u.id }, include: { reviewedBy: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    canQueue ? prisma.approvalRequest.findMany({ where: { type: { in: queueTypes } }, include: { requestedBy: true, reviewedBy: true }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 }) : Promise.resolve([]),
    prisma.dailyReport.findMany({ where: managerView ? {} : { OR: [{ userId: u.id }, ...(u.department?.managerId === u.id ? [{ user: { departmentId: u.departmentId } }] : [])] }, include: { user: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 60 }),
  ]);
  const tabs = [["mine", "My requests"], ...(canQueue ? [["queue", `Approval queue (${queue.filter((q) => q.status === "PENDING").length})`]] : []), ["reports", "Daily reports"]];
  return (
    <>
      <PageHeader title="Requests & Daily Reports" subtitle="Ask for assistance, submit balance enquiries and finance requests, and file your daily report." actions={<>
        <ModalForm trigger="Submit daily report" triggerClassName="btn-secondary" title="Daily report" action={submitDailyReport}>
          <Field label="Summary of today"><textarea name="summary" required rows={3} className="input" /></Field>
          <Field label="Completed work"><textarea name="completed" rows={2} className="input" /></Field>
          <Field label="Blockers / help needed"><textarea name="blockers" rows={2} className="input" /></Field>
          <Field label="Hours worked"><input name="hoursWorked" type="number" step="0.5" className="input w-32" /></Field>
        </ModalForm>
        {u.can("requests", "create") && <ModalForm trigger="+ New request" title="New request" action={createRequest}>
          <Field label="Type"><select name="type" className="input"><option value="ASSISTANCE">Request assistance</option><option value="BALANCE_ENQUIRY">Balance enquiry (finance)</option><option value="FINANCE">Finance / payment request</option><option value="GENERAL">General request</option></select></Field>
          <Field label="Title"><input name="title" required className="input" /></Field>
          <Field label="Details"><textarea name="details" rows={4} className="input" /></Field>
          <Field label="Amount (£, if applicable)"><input name="amount" type="number" step="0.01" className="input" /></Field>
        </ModalForm>}
      </>} />
      <div className="mb-4 flex flex-wrap gap-2">{tabs.map(([k, l]) => <Link key={k} href={`?tab=${k}`} className={tab === k ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>{l}</Link>)}</div>
      {tab === "mine" && (
        <Card padded={false}>{mine.length === 0 ? <Empty title="No requests yet" /> : (
          <TableWrap><table className="table"><thead><tr><th>Request</th><th>Type</th><th>Amount</th><th>Submitted</th><th>Status</th><th>Response</th></tr></thead><tbody>
            {mine.map((r) => <tr key={r.id}><td className="font-medium">{r.title}<p className="text-xs font-normal text-slate-500">{r.details}</p></td><td><Badge>{label(r.type)}</Badge></td><td>{r.amount ? fmtMoney(r.amount) : "—"}</td><td className="text-xs">{fmtDateTime(r.createdAt)}</td><td><StatusBadge status={r.status} /></td><td className="max-w-xs text-sm">{r.reviewNote}{r.reviewedBy && <p className="text-xs text-slate-500">— {r.reviewedBy.name}</p>}</td></tr>)}
          </tbody></table></TableWrap>
        )}</Card>
      )}
      {tab === "queue" && canQueue && (
        <Card padded={false}>{queue.length === 0 ? <Empty title="Nothing to review" /> : (
          <ul className="divide-y">{queue.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0"><p className="font-medium">{r.title} <Badge>{label(r.type)}</Badge> <StatusBadge status={r.status} /></p><p className="text-sm text-slate-600">{r.details}</p><p className="mt-1 text-xs text-slate-500">{r.requestedBy.name} · {fmtDateTime(r.createdAt)}{r.amount ? ` · ${fmtMoney(r.amount)}` : ""}</p>{r.reviewNote && <p className="mt-1 text-sm text-slate-700">↳ {r.reviewNote} — {r.reviewedBy?.name}</p>}</div>
              {r.status === "PENDING" && (
                <ActionForm action={reviewRequest} className="flex w-full max-w-md flex-col gap-2 md:w-96">
                  <input type="hidden" name="id" value={r.id} />
                  <textarea name="note" rows={2} className="input" placeholder={r.type === "BALANCE_ENQUIRY" ? "Reply with the balance information…" : "Response / note"} />
                  <div className="flex gap-2"><button name="status" value="APPROVED" className="btn-primary btn-sm">Approve / answer</button><button name="status" value="REJECTED" className="btn-danger btn-sm">Reject</button></div>
                </ActionForm>
              )}
            </li>
          ))}</ul>
        )}</Card>
      )}
      {tab === "reports" && (
        <Card padded={false}>{reports.length === 0 ? <Empty title="No daily reports" /> : (
          <TableWrap><table className="table"><thead><tr><th>Date</th><th>Employee</th><th>Summary</th><th>Completed</th><th>Blockers</th><th>Hours</th></tr></thead><tbody>
            {reports.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{fmtDate(r.date)}</td><td>{r.user.name}</td><td className="max-w-sm">{r.summary}</td><td className="max-w-xs text-sm">{r.completed}</td><td className="max-w-xs text-sm text-red-700">{r.blockers}</td><td>{r.hoursWorked?.toString() ?? "—"}</td></tr>)}
          </tbody></table></TableWrap>
        )}</Card>
      )}
    </>
  );
}
