import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma, TaskStatus } from "@prisma/client";
import { PageHeader, Card, FilterBar, StatusBadge, TableWrap, Avatar, Empty } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { fmtDate } from "@/lib/format";
import { createTask } from "./actions";
import { TaskFields } from "./fields";

export const metadata = { title: "Tasks" };
const COLS: TaskStatus[] = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_APPROVAL", "OVERDUE", "COMPLETED", "REJECTED"];

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("tasks");
  const sp = await searchParams;
  const manager = u.can("tasks", "manage") || u.can("tasks", "approve");
  const view = sp.view === "board" ? "board" : "list";
  const where: Prisma.TaskWhereInput = {
    deletedAt: null,
    ...(manager && !sp.mine ? {} : { OR: [{ assigneeId: u.id }, { createdById: u.id }, { assigneeId: null, departmentId: u.departmentId ?? "-" }] }),
    ...(sp.status ? { status: sp.status as TaskStatus } : {}), ...(sp.priority ? { priority: sp.priority as "HIGH" } : {}),
    ...(sp.assignee ? { assigneeId: sp.assignee } : {}), ...(sp.dept ? { departmentId: sp.dept } : {}),
    ...(sp.q ? { title: { contains: sp.q, mode: "insensitive" } } : {}),
  };
  const [tasks, users, departments] = await Promise.all([
    prisma.task.findMany({ where, include: { assignee: true, department: true, _count: { select: { comments: true } } }, orderBy: [{ status: "asc" }, { dueDate: "asc" }], take: 300 }),
    prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const qs = (o: Record<string, string>) => "?" + new URLSearchParams({ ...(Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>), ...o });
  return (
    <>
      <PageHeader title={manager && !sp.mine ? "Task Management" : "My Tasks"} subtitle={`${tasks.length} task(s)`} actions={<>
        <Link href={qs({ view: view === "board" ? "list" : "board" })} className="btn-secondary">{view === "board" ? "List view" : "Board view"}</Link>
        {u.can("tasks", "create") && <ModalForm trigger="+ New task" title="Create task" action={createTask} wide submitLabel="Create task"><TaskFields users={users} departments={departments} /></ModalForm>}
      </>} />
      <FilterBar>
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={sp.q} placeholder="Search tasks…" className="input w-56" />
        <select name="status" defaultValue={sp.status} className="input w-44"><option value="">All statuses</option>{COLS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}</select>
        <select name="priority" defaultValue={sp.priority} className="input w-36"><option value="">Any priority</option><option>URGENT</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select>
        {manager && <select name="assignee" defaultValue={sp.assignee} className="input w-44"><option value="">Anyone</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        {manager && <select name="dept" defaultValue={sp.dept} className="input w-44"><option value="">All departments</option>{departments.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
        {manager && <label className="flex items-center gap-1.5 px-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={!!sp.mine} /> Only mine</label>}
      </FilterBar>
      {view === "board" ? (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLS.map((c) => {
            const items = tasks.filter((t) => t.status === c);
            return (
              <div key={c} className="w-72 shrink-0 rounded-xl bg-slate-100 p-3">
                <div className="mb-2 flex items-center justify-between"><StatusBadge status={c} /><span className="text-xs font-semibold text-slate-500">{items.length}</span></div>
                <div className="space-y-2">{items.map((t) => (
                  <Link key={t.id} href={`/tasks/${t.id}`} className="block rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 hover:ring-navy-300">
                    <p className="text-sm font-medium">{t.title}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500"><StatusBadge status={t.priority} /><span>{fmtDate(t.dueDate)}</span></div>
                    <div className="mt-2 h-1 rounded bg-slate-100"><div className="h-1 rounded bg-navy-600" style={{ width: `${t.progress}%` }} /></div>
                    <p className="mt-2 text-xs text-slate-500">{t.assignee?.name ?? t.department?.name ?? "Unassigned"}</p>
                  </Link>
                ))}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card padded={false}>
          {tasks.length === 0 ? <Empty title="No tasks found" /> : (
            <TableWrap><table className="table"><thead><tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Progress</th><th>Deadline</th><th>Status</th></tr></thead><tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/tasks/${t.id}`} className="link">{t.title}</Link><p className="text-xs text-slate-500">{t.department?.name}{t._count.comments ? ` · ${t._count.comments} comments` : ""}</p></td>
                  <td>{t.assignee ? <span className="flex items-center gap-2"><Avatar name={t.assignee.name} color={t.assignee.avatarColor} size={24} />{t.assignee.name}</span> : <span className="text-slate-400">Department queue</span>}</td>
                  <td><StatusBadge status={t.priority} /></td>
                  <td className="w-32"><div className="h-1.5 rounded bg-slate-100"><div className="h-1.5 rounded bg-navy-600" style={{ width: `${t.progress}%` }} /></div><span className="text-xs text-slate-500">{t.progress}%</span></td>
                  <td className={t.status === "OVERDUE" ? "font-semibold text-red-600" : ""}>{fmtDate(t.dueDate)}</td>
                  <td><StatusBadge status={t.status} /></td>
                </tr>
              ))}
            </tbody></table></TableWrap>
          )}
        </Card>
      )}
    </>
  );
}
