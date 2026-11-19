import { Field } from "@/components/ui";

type Opt = { id: string; name: string };
export function EmployeeFields({ roles, departments, values, withPassword }: { roles: Opt[]; departments: Opt[]; values?: { [k: string]: unknown }; withPassword?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name"><input name="name" required className="input" defaultValue={String(values?.name ?? "")} /></Field>
      <Field label="Work email"><input name="email" type="email" required className="input" defaultValue={String(values?.email ?? "")} /></Field>
      <Field label="Role"><select name="roleId" required className="input" defaultValue={String(values?.roleId ?? "")}><option value="">Select role…</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>
      <Field label="Department"><select name="departmentId" className="input" defaultValue={String(values?.departmentId ?? "")}><option value="">— None —</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Job title"><input name="jobTitle" className="input" defaultValue={String(values?.jobTitle ?? "")} /></Field>
      <Field label="Phone"><input name="phone" className="input" defaultValue={String(values?.phone ?? "")} /></Field>
      {withPassword && <Field label="Temporary password" className="sm:col-span-2" hint="Min 10 chars, upper + lower case and a number. The employee must change it at first login."><input name="password" type="text" required minLength={10} className="input font-mono" autoComplete="off" /></Field>}
    </div>
  );
}
