import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Field } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { saveDepartment } from "./actions";
import { DeptFields } from "./fields";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const u = await requirePage("departments");
  const [deps, users] = await Promise.all([
    prisma.department.findMany({ where: { deletedAt: null }, include: { manager: true, _count: { select: { users: { where: { deletedAt: null } }, tasks: { where: { deletedAt: null, status: { notIn: ["COMPLETED", "REJECTED"] } } } } } }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Department Management" subtitle="Each department has its own dashboard, group chat and task queue." actions={u.can("departments", "create") && (
        <ModalForm trigger="+ New department" title="Create department" action={saveDepartment}><DeptFields users={users} /></ModalForm>
      )} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {deps.map((d) => (
          <Link key={d.id} href={`/departments/${d.id}`} className="card group block overflow-hidden transition hover:shadow-md">
            <div className="h-1.5" style={{ background: d.color }} />
            <div className="p-5">
              <div className="flex items-start justify-between"><h3 className="font-semibold group-hover:text-navy-600">{d.name}</h3><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">{d.code}</span></div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-500">{d.description}</p>
              <div className="mt-4 flex gap-6 text-sm"><span><b>{d._count.users}</b> members</span><span><b>{d._count.tasks}</b> open tasks</span></div>
              <p className="mt-2 text-xs text-slate-500">Manager: {d.manager?.name ?? "—"}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
