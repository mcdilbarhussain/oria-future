import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, TableWrap, Field, Badge } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { fmtMoney, fmtDate } from "@/lib/format";
import { savePayment } from "../actions";
import { audit } from "@/lib/audit";

export const metadata = { title: "Employee Payments" };

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const u = await requirePage("payroll");
  const { period } = await searchParams;
  await audit({ userId: u.id, module: "payroll", action: "view", summary: `viewed employee payment records${period ? ` for ${period}` : ""}` });
  const [rows, users] = await Promise.all([
    prisma.employeePayment.findMany({ where: { deletedAt: null, ...(period ? { period } : {}) }, include: { user: true }, orderBy: [{ period: "desc" }, { createdAt: "desc" }], take: 300 }),
    prisma.user.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  return (
    <>
      <PageHeader title="Employee Payment Records" subtitle={<span className="flex items-center gap-2"><Badge tone="red">Restricted</Badge> Only roles with the payroll permission can open this page. Access is logged.</span>} actions={<>
        {u.can("payroll", "export") && <a className="btn-secondary" href={`/api/export/payroll?format=xlsx${period ? `&period=${period}` : ""}`}>Export</a>}
        {u.can("payroll", "create") && <ModalForm trigger="+ Record payment" title="Employee payment" action={savePayment}>
          <Field label="Employee"><select name="userId" required className="input">{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Period"><input name="period" type="month" required defaultValue={new Date().toISOString().slice(0, 7)} className="input" /></Field><Field label="Type"><select name="type" className="input"><option>SALARY</option><option>BONUS</option><option>ADVANCE</option><option>REIMBURSEMENT</option></select></Field>
          <Field label="Amount (£)"><input name="amount" type="number" step="0.01" required className="input" /></Field><Field label="Paid on"><input name="paidAt" type="date" className="input" /></Field></div>
          <Field label="Note"><input name="note" className="input" /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="alsoExpense" defaultChecked /> Also record as a salary expense in finance</label>
        </ModalForm>}
      </>} />
      <form className="mb-4 flex items-end gap-2"><Field label="Period"><input type="month" name="period" defaultValue={period} className="input" /></Field><button className="btn-secondary">Filter</button></form>
      <Card padded={false}>
        <TableWrap><table className="table"><thead><tr><th>Period</th><th>Employee</th><th>Type</th><th className="text-right">Amount</th><th>Paid</th><th>Note</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td>{r.period}</td><td>{r.user.name}</td><td><Badge>{r.type}</Badge></td><td className="text-right font-semibold">{fmtMoney(r.amount, r.currency)}</td><td>{fmtDate(r.paidAt)}</td><td className="text-xs text-slate-500">{r.note}</td></tr>)}
        </tbody><tfoot><tr><td colSpan={3} className="px-3 py-2 text-right font-semibold">Total</td><td className="px-3 py-2 text-right font-bold">{fmtMoney(total)}</td><td colSpan={2} /></tr></tfoot></table></TableWrap>
      </Card>
    </>
  );
}
