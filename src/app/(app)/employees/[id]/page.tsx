import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isOnline } from "@/lib/events";
import { PageHeader, Card, KV, StatusBadge, Avatar, Badge, TableWrap, Stat } from "@/components/ui";
import { ActionButton, ActionForm, ModalForm, SubmitButton } from "@/components/forms";
import { fmtDate, fmtDateTime, timeAgo } from "@/lib/format";
import { EmployeeFields } from "../form";
import { updateEmployee, setEmployeeStatus, removeEmployee, adminResetPassword, reset2FA, forceSignOut, setEbayAssignments } from "../actions";

export default async function EmployeeDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("employees");
  const { id } = await params;
  const e = await prisma.user.findFirst({ where: { id, deletedAt: null }, include: { role: true, department: true, ebayAssignments: true } });
  if (!e) notFound();
  const [roles, departments, accounts, tasks, logins, activity, stats, sessions] = await Promise.all([
    prisma.role.findMany({ orderBy: { level: "desc" } }),
    prisma.department.findMany({ where: { deletedAt: null } }),
    prisma.ebayAccount.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { assigneeId: id, deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 10 }),
    u.can("activity_logs", "view") ? prisma.loginLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10 }) : Promise.resolve([]),
    u.can("activity_logs", "view") ? prisma.auditLog.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 10 }) : Promise.resolve([]),
    prisma.task.groupBy({ by: ["status"], where: { assigneeId: id, deletedAt: null }, _count: true }),
    prisma.session.count({ where: { userId: id, expiresAt: { gt: new Date() } } }),
  ]);
  const count = (s: string) => stats.find((x) => x.status === s)?._count ?? 0;
  const done = count("COMPLETED");
  const onTime = await prisma.task.count({ where: { assigneeId: id, status: "COMPLETED", completedAt: { not: null }, OR: [{ dueDate: null }, { completedAt: { lte: prisma.task.fields.dueDate } }] } });
  const editable = u.isSuperAdmin || (e.role.level < u.role.level);
  const assignable = roles.filter((r) => u.isSuperAdmin || r.level < u.role.level);
  return (
    <>
      <PageHeader back={{ href: "/employees", label: "Employees" }} title={e.name} subtitle={<span className="flex items-center gap-2">{e.role.name} · {e.department?.name ?? "No department"} <StatusBadge status={e.status} /></span>}
        actions={editable && e.id !== u.id && (<>
          {u.can("employees", "edit") && <ModalForm trigger="Edit" triggerClassName="btn-secondary" title="Edit employee" action={updateEmployee} wide>
            <input type="hidden" name="id" value={e.id} />
            <EmployeeFields roles={assignable} departments={departments} values={e} />
          </ModalForm>}
          {u.can("employees", "edit") && <ActionButton action={setEmployeeStatus} fields={{ id: e.id, status: e.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" }} className={e.status === "ACTIVE" ? "btn-secondary" : "btn-primary"} confirm={e.status === "ACTIVE" ? "Suspend this employee? They will be signed out immediately." : undefined}>{e.status === "ACTIVE" ? "Suspend" : "Reactivate"}</ActionButton>}
          {u.can("employees", "delete") && <ActionButton action={removeEmployee} fields={{ id: e.id }} className="btn-danger" confirm="Remove this employee? Their login is disabled; history is retained.">Remove</ActionButton>}
        </>)} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Tasks completed" value={done} tone="green" />
        <Stat label="On-time completion" value={done ? `${Math.round((onTime / done) * 100)}%` : "—"} tone="gold" />
        <Stat label="Open tasks" value={count("NEW") + count("ASSIGNED") + count("IN_PROGRESS")} />
        <Stat label="Overdue" value={count("OVERDUE")} tone={count("OVERDUE") ? "red" : "slate"} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Profile" className="lg:col-span-2">
          <div className="mb-4 flex items-center gap-3"><Avatar name={e.name} color={e.avatarColor} size={48} online={isOnline(e.id)} /><div><p className="font-semibold">{e.name}</p><p className="text-sm text-slate-500">{e.jobTitle}</p></div></div>
          <KV items={[["Email", e.email], ["Phone", e.phone], ["Role", e.role.name], ["Department", e.department?.name], ["Joined", fmtDate(e.createdAt)], ["Last login", fmtDateTime(e.lastLoginAt)], ["Last seen", e.lastSeenAt ? timeAgo(e.lastSeenAt) : "—"], ["Two-factor auth", e.totpEnabled ? <Badge tone="green">Enabled</Badge> : <Badge>Disabled</Badge>], ["Active sessions", sessions], ["Must change password", e.mustChangePassword ? "Yes" : "No"]]} />
        </Card>
        {editable && e.id !== u.id && u.can("employees", "edit") && (
          <Card title="Security controls">
            <ActionForm action={adminResetPassword} className="space-y-2">
              <input type="hidden" name="id" value={e.id} />
              <label className="label">Set temporary password</label>
              <input name="password" className="input font-mono" required minLength={10} autoComplete="off" />
              <SubmitButton className="btn-secondary w-full">Reset password</SubmitButton>
            </ActionForm>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton action={forceSignOut} fields={{ id: e.id }}>Force sign-out</ActionButton>
              {e.totpEnabled && u.can("employees", "manage") && <ActionButton action={reset2FA} fields={{ id: e.id }} confirm="Reset 2FA for this user?">Reset 2FA</ActionButton>}
            </div>
          </Card>
        )}
        {u.can("ebay_accounts", "manage") && (
          <Card title="eBay account access" className="lg:col-span-1">
            <ActionForm action={setEbayAssignments} resetOnSuccess={false} className="space-y-2">
              <input type="hidden" name="id" value={e.id} />
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="accounts" value={a.id} defaultChecked={e.ebayAssignments.some((x) => x.ebayAccountId === a.id)} className="h-4 w-4 rounded border-slate-300" />{a.name}</label>
              ))}
              <p className="text-xs text-slate-500">Employees only see orders, listings and messages of assigned accounts (unless their role manages all accounts).</p>
              <SubmitButton className="btn-primary btn-sm">Save access</SubmitButton>
            </ActionForm>
          </Card>
        )}
        <Card title="Recent tasks" padded={false} className="lg:col-span-2">
          <TableWrap><table className="table"><thead><tr><th>Task</th><th>Due</th><th>Status</th></tr></thead><tbody>
            {tasks.map((t) => <tr key={t.id}><td><Link className="link" href={`/tasks/${t.id}`}>{t.title}</Link></td><td>{fmtDate(t.dueDate)}</td><td><StatusBadge status={t.status} /></td></tr>)}
            {!tasks.length && <tr><td colSpan={3} className="text-center text-slate-500">No tasks</td></tr>}
          </tbody></table></TableWrap>
        </Card>
        {logins.length > 0 && (
          <Card title="Login history" padded={false}>
            <ul className="divide-y text-sm">{logins.map((l) => <li key={l.id} className="flex justify-between px-4 py-2"><span>{l.success ? <Badge tone="green">Success</Badge> : <Badge tone="red">{l.reason ?? "Failed"}</Badge>} <span className="ml-1 text-xs text-slate-500">{l.ip}</span></span><span className="text-xs text-slate-500">{fmtDateTime(l.createdAt)}</span></li>)}</ul>
          </Card>
        )}
        {activity.length > 0 && (
          <Card title="Recent activity" padded={false} className="lg:col-span-3">
            <ul className="divide-y text-sm">{activity.map((l) => <li key={l.id} className="flex justify-between gap-3 px-4 py-2"><span><Badge>{l.module}</Badge> {l.summary}</span><span className="shrink-0 text-xs text-slate-500">{fmtDateTime(l.createdAt)}</span></li>)}</ul>
          </Card>
        )}
      </div>
    </>
  );
}
