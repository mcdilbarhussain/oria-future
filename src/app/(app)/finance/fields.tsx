import { Field } from "@/components/ui";
import { CATEGORIES } from "@/lib/finance-constants";
type Opt = { id: string; name: string };
export function TxFields({ accounts, suppliers, financeAccounts }: { accounts: Opt[]; suppliers: Opt[]; financeAccounts: Opt[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field label="Type"><select name="type" className="input"><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></Field>
      <Field label="Category"><select name="category" className="input">
        <optgroup label="Expense">{CATEGORIES.EXPENSE.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</optgroup>
        <optgroup label="Income">{CATEGORIES.INCOME.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</optgroup>
      </select></Field>
      <Field label="Date"><input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="input" /></Field>
      <Field label="Amount"><input name="amount" type="number" step="0.01" min="0.01" required className="input" /></Field>
      <Field label="Currency"><select name="currency" className="input"><option>GBP</option><option>USD</option><option>EUR</option><option>CNY</option></select></Field>
      <Field label="Reference"><input name="reference" className="input" placeholder="Invoice no." /></Field>
      <Field label="Description" className="sm:col-span-3"><input name="description" required className="input" /></Field>
      <Field label="eBay account"><select name="ebayAccountId" className="input"><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Supplier"><select name="supplierId" className="input"><option value="">—</option>{suppliers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Paid from / into"><select name="financeAccountId" className="input"><option value="">—</option>{financeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Payment status"><select name="paymentStatus" className="input"><option value="PAID">Paid</option><option value="OUTSTANDING">Outstanding</option></select></Field>
      <Field label="Due date"><input name="dueDate" type="date" className="input" /></Field>
      <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="isEstimated" /> Estimate / forecast (not actual)</label>
      <Field label="Receipt / invoice" className="sm:col-span-3"><input name="file" type="file" className="input" /></Field>
    </div>
  );
}
