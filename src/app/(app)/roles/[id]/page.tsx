import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ACTIONS, MODULES, type Module } from "@/lib/permissions";
import { PageHeader, Card, Field } from "@/components/ui";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { savePermissions, deleteRole } from "../actions";

export default async function RoleDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("roles");
  const { id } = await params;
  const role = await prisma.role.findUnique({ where: { id }, include: { permissions: true } });
  if (!role) notFound();
  const has = new Set(role.permissions.map((p) => `${p.module}:${p.action}`));
  const isOwnerRole = role.key === "super_admin";
  const editable = u.isSuperAdmin && !isOwnerRole;
  return (
    <>
      <PageHeader back={{ href: "/roles", label: "Roles" }} title={role.name} subtitle={role.description} actions={editable && !role.isSystem && <ActionButton action={deleteRole} fields={{ id }} className="btn-danger" confirm="Delete this role?">Delete role</ActionButton>} />
      {isOwnerRole && <p className="mb-4 rounded-lg bg-navy-50 px-3 py-2 text-sm text-navy-800">The Super Admin / Owner role has unrestricted access to every module and cannot be limited.</p>}
      <ActionForm action={savePermissions} resetOnSuccess={false}>
        <input type="hidden" name="roleId" value={id} />
        <Card title="Role details" className="mb-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name"><input name="name" defaultValue={role.name} className="input" disabled={!editable} /></Field>
            <Field label="Description"><input name="description" defaultValue={role.description ?? ""} className="input" disabled={!editable} /></Field>
            <Field label="Level"><input name="level" type="number" min={1} max={95} defaultValue={role.level} className="input" disabled={!editable} /></Field>
          </div>
        </Card>
        <Card title="Module permissions" padded={false} actions={editable && <SubmitButton className="btn-primary btn-sm">Save permissions</SubmitButton>}>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Module</th>{ACTIONS.map((a) => <th key={a} className="text-center capitalize">{a}</th>)}</tr></thead>
              <tbody>
                {(Object.keys(MODULES) as Module[]).map((m) => (
                  <tr key={m}>
                    <td className="font-medium">{MODULES[m]}{m === "payroll" && <span className="ml-1 text-xs text-red-600">confidential</span>}</td>
                    {ACTIONS.map((a) => {
                      const locked = m === "roles" && a !== "view";
                      return <td key={a} className="text-center"><input type="checkbox" name="perm" value={`${m}:${a}`} defaultChecked={isOwnerRole || has.has(`${m}:${a}`)} disabled={!editable || locked} className="h-4 w-4 rounded border-slate-300 text-navy-700" title={locked ? "Reserved for Super Admin" : undefined} /></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-xs text-slate-500">“Manage” implies every other action on that module. Role management actions are reserved for the Super Admin.</p>
        </Card>
      </ActionForm>
    </>
  );
}
