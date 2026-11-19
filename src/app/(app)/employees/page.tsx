import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isOnline } from "@/lib/events";
import { PageHeader, Card, FilterBar, StatusBadge, Avatar, TableWrap, Empty, Badge } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { createEmployee } from "./actions";
import { EmployeeFields } from "./form";

export const metadata = { title: "Employees" };

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("employees");
  const sp = await searchParams;
  const [users, roles, departments] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }, { jobTitle: { contains: sp.q, mode: "insensitive" } }] } : {}),
        ...(sp.dept ? { departmentId: sp.dept } : {}), ...(sp.role ? { roleId: sp.role } : {}), ...(sp.status ? { status: sp.status as "ACTIVE" } : {}),
      },
      include: { role: true, department: true, _count: { select: { tasksAssigned: { where: { status: { notIn: ["COMPLETED", "REJECTED"] }, deletedAt: null } } } } },
      orderBy: [{ role: { level: "desc" } }, { name: "asc" }],
    }),
    prisma.role.findMany({ orderBy: { level: "desc" } }),
    prisma.department.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
  ]);
  const assignable = roles.filter((r) => u.isSuperAdmin || r.level < u.role.level);
  return (
    <>
      <PageHeader title="Employee Management" subtitle={`${users.length} employees`} actions={u.can("employees", "create") && (
        <ModalForm trigger="+ Add employee" title="Create employee login" action={createEmployee} wide submitLabel="Create employee">
          <EmployeeFields roles={assignable} departments={departments} withPassword />
        </ModalForm>
      )} />
      <FilterBar>
        <input name="q" defaultValue={sp.q} placeholder="Search name, email, title…" className="input w-64" />
        <select name="dept" defaultValue={sp.dept} className="input w-48"><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select name="role" defaultValue={sp.role} className="input w-52"><option value="">All roles</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        <select name="status" defaultValue={sp.status} className="input w-36"><option value="">Any status</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select>
      </FilterBar>
      <Card padded={false}>
        {users.length === 0 ? <Empty title="No employees match your filters" /> : (
          <TableWrap><table className="table">
            <thead><tr><th>Employee</th><th>Role</th><th>Department</th><th>Open tasks</th><th>Last login</th><th>2FA</th><th>Status</th></tr></thead>
            <tbody>{users.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/employees/${e.id}`} className="flex items-center gap-3"><Avatar name={e.name} color={e.avatarColor} online={isOnline(e.id)} /><span><span className="block font-medium text-navy-900 hover:underline">{e.name}</span><span className="text-xs text-slate-500">{e.email}</span></span></Link></td>
                <td>{e.role.name}</td><td>{e.department?.name ?? "—"}</td><td>{e._count.tasksAssigned}</td>
                <td className="text-xs text-slate-500">{fmtDateTime(e.lastLoginAt)}</td>
                <td>{e.totpEnabled ? <Badge tone="green">On</Badge> : <Badge>Off</Badge>}</td>
                <td><StatusBadge status={e.status} /></td>
              </tr>
            ))}</tbody>
          </table></TableWrap>
        )}
      </Card>
    </>
  );
}
