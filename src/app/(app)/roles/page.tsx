import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Field, Badge, TableWrap } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { createRole } from "./actions";

export const metadata = { title: "Roles & Permissions" };

export default async function RolesPage() {
  const u = await requirePage("roles");
  const roles = await prisma.role.findMany({ include: { _count: { select: { users: { where: { deletedAt: null } }, permissions: true } } }, orderBy: { level: "desc" } });
  return (
    <>
      <PageHeader title="Roles & Permissions" subtitle="Role-based access control. Permissions are enforced on the server for every page, action and API." actions={u.isSuperAdmin && (
        <ModalForm trigger="+ Custom role" title="Create custom role" action={createRole}>
          <Field label="Role name"><input name="name" required className="input" /></Field>
          <Field label="Description"><input name="description" className="input" /></Field>
          <Field label="Seniority level (1–95)" hint="Managers can only manage employees with a lower level."><input name="level" type="number" min={1} max={95} defaultValue={30} className="input" /></Field>
          <Field label="Copy permissions from"><select name="copyFrom" className="input"><option value="">— Start empty —</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
        </ModalForm>
      )} />
      {!u.isSuperAdmin && <p className="mb-4 rounded-lg bg-gold-50 px-3 py-2 text-sm text-gold-800 ring-1 ring-gold-200">View only – only the Super Admin can create roles or change permissions.</p>}
      <Card padded={false}>
        <TableWrap><table className="table"><thead><tr><th>Role</th><th>Level</th><th>Employees</th><th>Permissions</th><th>Type</th></tr></thead><tbody>
          {roles.map((r) => <tr key={r.id}><td><Link href={`/roles/${r.id}`} className="link">{r.name}</Link><p className="text-xs text-slate-500">{r.description}</p></td><td>{r.level}</td><td>{r._count.users}</td><td>{r.key === "super_admin" ? "All" : r._count.permissions}</td><td>{r.isSystem ? <Badge tone="navy">Default</Badge> : <Badge tone="gold">Custom</Badge>}</td></tr>)}
        </tbody></table></TableWrap>
      </Card>
    </>
  );
}
