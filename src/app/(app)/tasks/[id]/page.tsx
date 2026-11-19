import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, KV, StatusBadge, Avatar, Badge, Field } from "@/components/ui";
import { ActionButton, ActionForm, ModalForm, SubmitButton } from "@/components/forms";
import { fmtDateTime, fmtDate } from "@/lib/format";
import { ASSIGNEE_TRANSITIONS, MANAGER_TRANSITIONS, type TStatus } from "@/lib/workflows/tasks";
import { changeTaskStatus, updateProgress, addTaskComment, reassignTask, deleteTask } from "../actions";
import { Paperclip } from "lucide-react";

const LABEL: Record<string, string> = { IN_PROGRESS: "Accept / start", WAITING_APPROVAL: "Submit for approval", COMPLETED: "Approve & complete", REJECTED: "Reject", ASSIGNED: "Re-assign" };

export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("tasks");
  const { id } = await params;
  const t = await prisma.task.findFirst({ where: { id, deletedAt: null }, include: { assignee: true, createdBy: true, department: true, comments: { include: { user: true }, orderBy: { createdAt: "asc" } } } });
  if (!t) notFound();
  const manager = u.can("tasks", "manage") || u.can("tasks", "approve");
  const mine = t.assigneeId === u.id || (!t.assigneeId && t.departmentId === u.departmentId);
  if (!manager && !mine && t.createdById !== u.id) notFound();
  const [files, users] = await Promise.all([
    prisma.fileAsset.findMany({ where: { entityType: "task", entityId: id }, include: { uploadedBy: true } }),
    manager ? prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE" }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const st = t.status as TStatus;
  const actions = [...new Set([...(mine ? ASSIGNEE_TRANSITIONS[st] ?? [] : []), ...(manager ? [...(MANAGER_TRANSITIONS[st] ?? []), ...(ASSIGNEE_TRANSITIONS[st] ?? [])] : [])])];
  const canEdit = u.can("tasks", "edit");
  return (
    <>
      <PageHeader back={{ href: "/tasks", label: "Tasks" }} title={t.title} subtitle={<span className="flex items-center gap-2"><StatusBadge status={t.status} /><StatusBadge status={t.priority} /> Created by {t.createdBy.name} · {fmtDateTime(t.createdAt)}</span>} actions={<>
        {canEdit && actions.map((a) => (
          <ModalForm key={a} trigger={LABEL[a] ?? a} triggerClassName={a === "REJECTED" ? "btn-danger" : a === "COMPLETED" ? "btn-gold" : "btn-primary"} title={LABEL[a] ?? a} action={changeTaskStatus} submitLabel="Confirm">
            <input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value={a} />
            <Field label={a === "REJECTED" ? "Reason (sent to employee)" : "Note (optional)"}><textarea name="note" rows={3} className="input" required={a === "REJECTED"} /></Field>
          </ModalForm>
        ))}
        {manager && <ModalForm trigger="Reassign / deadline" triggerClassName="btn-secondary" title="Update assignment" action={reassignTask}>
          <input type="hidden" name="id" value={t.id} />
          <Field label="Assignee"><select name="assigneeId" defaultValue={t.assigneeId ?? ""} className="input"><option value="">Department queue</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <Field label="Deadline"><input type="datetime-local" name="dueDate" defaultValue={t.dueDate ? new Date(t.dueDate.getTime() - t.dueDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""} className="input" /></Field>
          <Field label="Priority"><select name="priority" defaultValue={t.priority} className="input"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></Field>
        </ModalForm>}
        {u.can("tasks", "delete") && <ActionButton action={deleteTask} fields={{ id: t.id }} className="btn-ghost text-red-600" confirm="Delete this task?">Delete</ActionButton>}
      </>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Instructions"><p className="whitespace-pre-wrap text-sm text-slate-700">{t.description || "No instructions."}</p></Card>
          <Card title="Activity & comments" padded={false}>
            <ul className="divide-y">
              {t.comments.map((c) => (
                <li key={c.id} className={`flex gap-3 px-4 py-3 ${c.kind === "ASSISTANCE" ? "bg-red-50/60" : c.kind === "STATUS" ? "bg-slate-50" : ""}`}>
                  <Avatar name={c.user.name} color={c.user.avatarColor} size={28} />
                  <div className="min-w-0 flex-1"><p className="text-sm"><b>{c.user.name}</b> {c.kind !== "COMMENT" && <Badge tone={c.kind === "ASSISTANCE" ? "red" : c.kind === "PROOF" ? "green" : "slate"}>{c.kind === "ASSISTANCE" ? "Assistance requested" : c.kind === "PROOF" ? "Proof of completion" : "Status"}</Badge>} <span className="text-xs text-slate-400">{fmtDateTime(c.createdAt)}</span></p><p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{c.body}</p></div>
                </li>
              ))}
            </ul>
            <ActionForm action={addTaskComment} className="space-y-2 border-t p-4">
              <input type="hidden" name="id" value={t.id} />
              <textarea name="body" required rows={3} className="input" placeholder="Write a comment, update or request…" />
              <div className="flex flex-wrap items-center gap-2">
                <select name="kind" className="input w-56"><option value="COMMENT">Comment</option><option value="PROOF">Proof of completion</option><option value="ASSISTANCE">Request assistance</option></select>
                <input type="file" name="files" multiple className="text-sm" />
                <SubmitButton className="btn-primary ml-auto">Post</SubmitButton>
              </div>
            </ActionForm>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Details">
            <KV items={[["Assignee", t.assignee ? <span className="flex items-center gap-2"><Avatar name={t.assignee.name} color={t.assignee.avatarColor} size={22} />{t.assignee.name}</span> : "Department queue"], ["Department", t.department?.name], ["Deadline", <span key="d" className={t.status === "OVERDUE" ? "font-semibold text-red-600" : ""}>{fmtDateTime(t.dueDate)}</span>], ["Accepted", fmtDateTime(t.acceptedAt)], ["Submitted", fmtDateTime(t.submittedAt)], ["Completed", fmtDate(t.completedAt)]]} />
          </Card>
          <Card title={`Progress – ${t.progress}%`}>
            <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-gradient-to-r from-navy-600 to-gold-500" style={{ width: `${t.progress}%` }} /></div>
            {(mine || manager) && canEdit && !["COMPLETED", "WAITING_APPROVAL"].includes(t.status) && (
              <ActionForm action={updateProgress} resetOnSuccess={false} className="mt-3 flex items-center gap-2">
                <input type="hidden" name="id" value={t.id} /><input type="range" name="progress" min={0} max={100} step={5} defaultValue={t.progress} className="flex-1" />
                <SubmitButton className="btn-secondary btn-sm">Update</SubmitButton>
              </ActionForm>
            )}
          </Card>
          <Card title="Documents & proof" padded={false}>
            <ul className="divide-y text-sm">{files.map((f) => <li key={f.id} className="flex items-center gap-2 px-4 py-2"><Paperclip size={14} className="text-slate-400" /><a href={`/api/files/${f.id}`} className="link truncate" target="_blank">{f.filename}</a><span className="ml-auto text-xs text-slate-400">{f.uploadedBy.name.split(" ")[0]}</span></li>)}{!files.length && <li className="px-4 py-3 text-slate-500">No files</li>}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
