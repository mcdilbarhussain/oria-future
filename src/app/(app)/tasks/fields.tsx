import { Field } from "@/components/ui";
export function TaskFields({ users, departments }: { users: { id: string; name: string }[]; departments: { id: string; name: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title" className="sm:col-span-2"><input name="title" required className="input" /></Field>
      <Field label="Instructions" className="sm:col-span-2"><textarea name="description" rows={4} className="input" /></Field>
      <Field label="Assign to employee"><select name="assigneeId" className="input"><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="…or department"><select name="departmentId" className="input"><option value="">—</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Priority"><select name="priority" defaultValue="MEDIUM" className="input"><option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>URGENT</option></select></Field>
      <Field label="Deadline"><input name="dueDate" type="datetime-local" className="input" /></Field>
      <Field label="Attachments" className="sm:col-span-2"><input name="files" type="file" multiple className="input" /></Field>
    </div>
  );
}
