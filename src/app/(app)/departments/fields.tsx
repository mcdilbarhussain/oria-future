import { Field } from "@/components/ui";

export function DeptFields({ users, v }: { users: { id: string; name: string }[]; v?: { id?: string; name?: string; code?: string; description?: string | null; color?: string; managerId?: string | null } }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {v?.id && <input type="hidden" name="id" value={v.id} />}
      <Field label="Name"><input name="name" required className="input" defaultValue={v?.name} /></Field>
      <Field label="Code"><input name="code" required className="input uppercase" defaultValue={v?.code} placeholder="e.g. RETURNS" /></Field>
      <Field label="Manager"><select name="managerId" className="input" defaultValue={v?.managerId ?? ""}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="Colour"><input name="color" type="color" className="input h-10 p-1" defaultValue={v?.color ?? "#1b2e5a"} /></Field>
      <Field label="Description" className="sm:col-span-2"><textarea name="description" rows={2} className="input" defaultValue={v?.description ?? ""} /></Field>
    </div>
  );
}

