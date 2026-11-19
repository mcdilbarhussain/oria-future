import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isOnline } from "@/lib/events";
import { PageHeader, Card, Stat, StatusBadge, Avatar, TableWrap } from "@/components/ui";
import { ActionButton, ActionForm, ModalForm, SubmitButton } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { DeptFields } from "../fields";
import { saveDepartment, deleteDepartment, sendInstruction } from "../actions";

export default async function DepartmentDashboard({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("departments");
  const { id } = await params;
  const d = await prisma.department.findFirst({ where: { id, deletedAt: null }, include: { manager: true } });
  if (!d) notFound();
  const [members, tasks, users, statusCounts, reports] = await Promise.all([
    prisma.user.findMany({ where: { departmentId: id, deletedAt: null }, include: { role: true }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { deletedAt: null, OR: [{ departmentId: id }, { assignee: { departmentId: id } }], status: { notIn: ["COMPLETED"] } }, include: { assignee: true }, orderBy: { dueDate: "asc" }, take: 15 }),
    prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.task.groupBy({ by: ["status"], where: { deletedAt: null, OR: [{ departmentId: id }, { assignee: { departmentId: id } }] }, _count: true }),
    prisma.dailyReport.findMany({ where: { user: { departmentId: id } }, include: { user: true }, orderBy: { date: "desc" }, take: 5 }),
  ]);
  const n = (s: string) => statusCounts.find((x) => x.status === s)?._count ?? 0;
  return (
    <>
      <PageHeader back={{ href: "/departments", label: "Departments" }} title={d.name} subtitle={d.description} actions={<>
        {u.can("departments", "edit") && <ModalForm trigger="Edit" triggerClassName="btn-secondary" title="Edit department" action={saveDepartment}><DeptFields users={users} v={d} /></ModalForm>}
        {u.can("departments", "delete") && <ActionButton action={deleteDepartment} fields={{ id }} className="btn-danger" confirm="Archive this department?">Archive</ActionButton>}
      </>} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Members" value={members.length} />
        <Stat label="In progress" value={n("IN_PROGRESS") + n("ASSIGNED") + n("NEW")} tone="gold" />
        <Stat label="Awaiting approval" value={n("WAITING_APPROVAL")} tone="gold" />
        <Stat label="Overdue" value={n("OVERDUE")} tone={n("OVERDUE") ? "red" : "green"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Pending & active tasks" padded={false} className="lg:col-span-2">
          <TableWrap><table className="table"><thead><tr><th>Task</th><th>Assignee</th><th>Due</th><th>Status</th></tr></thead><tbody>
            {tasks.map((t) => <tr key={t.id}><td><Link className="link" href={`/tasks/${t.id}`}>{t.title}</Link></td><td>{t.assignee?.name ?? "Department"}</td><td>{fmtDate(t.dueDate)}</td><td><StatusBadge status={t.status} /></td></tr>)}
            {!tasks.length && <tr><td colSpan={4} className="py-6 text-center text-slate-500">No active tasks</td></tr>}
          </tbody></table></TableWrap>
        </Card>
        <div className="space-y-6">
          {u.can("departments", "manage") && (
            <Card title="Send instruction to department">
              <ActionForm action={sendInstruction} className="space-y-2"><input type="hidden" name="id" value={id} /><textarea name="message" required rows={3} className="input" placeholder="Instruction… (posted & pinned in the department chat, and notified to every member)" /><SubmitButton className="btn-primary btn-sm">Send</SubmitButton></ActionForm>
            </Card>
          )}
          <Card title="Members" padded={false}>
            <ul className="divide-y">{members.map((m) => <li key={m.id} className="flex items-center gap-3 px-4 py-2.5"><Avatar name={m.name} color={m.avatarColor} online={isOnline(m.id)} size={28} /><div className="min-w-0"><Link href={`/employees/${m.id}`} className="block truncate text-sm font-medium hover:underline">{m.name}</Link><p className="text-xs text-slate-500">{m.role.name}{d.managerId === m.id ? " · Manager" : ""}</p></div></li>)}</ul>
          </Card>
          <Card title="Latest daily reports" padded={false}>
            <ul className="divide-y text-sm">{reports.map((r) => <li key={r.id} className="px-4 py-2.5"><p className="font-medium">{r.user.name} <span className="text-xs font-normal text-slate-500">· {fmtDate(r.date)}</span></p><p className="text-slate-600">{r.summary}</p></li>)}{!reports.length && <li className="px-4 py-4 text-slate-500">No reports yet</li>}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
