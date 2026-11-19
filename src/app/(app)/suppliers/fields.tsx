import { Field } from "@/components/ui";
type S = { id?: string; companyName?: string; contactPerson?: string | null; email?: string | null; phone?: string | null; wechat?: string | null; website?: string | null; city?: string | null; province?: string | null; country?: string; categories?: string[]; paymentTerms?: string | null; currency?: string; defaultShippingCost?: unknown; notes?: string | null };
export function SupplierFields({ s }: { s?: S }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {s?.id && <input type="hidden" name="id" value={s.id} />}
      <Field label="Company name" className="sm:col-span-2"><input name="companyName" required defaultValue={s?.companyName} className="input" /></Field>
      <Field label="Contact person"><input name="contactPerson" defaultValue={s?.contactPerson ?? ""} className="input" /></Field>
      <Field label="Email"><input name="email" type="email" defaultValue={s?.email ?? ""} className="input" /></Field>
      <Field label="Phone"><input name="phone" defaultValue={s?.phone ?? ""} className="input" /></Field>
      <Field label="WeChat ID"><input name="wechat" defaultValue={s?.wechat ?? ""} className="input" /></Field>
      <Field label="City"><input name="city" defaultValue={s?.city ?? ""} className="input" /></Field>
      <Field label="Province"><input name="province" defaultValue={s?.province ?? ""} className="input" /></Field>
      <Field label="Country"><input name="country" defaultValue={s?.country ?? "China"} className="input" /></Field>
      <Field label="Website / Alibaba store"><input name="website" defaultValue={s?.website ?? ""} className="input" /></Field>
      <Field label="Product categories" hint="Comma separated" className="sm:col-span-2"><input name="categories" defaultValue={s?.categories?.join(", ")} className="input" /></Field>
      <Field label="Payment terms"><input name="paymentTerms" defaultValue={s?.paymentTerms ?? ""} className="input" placeholder="30% deposit, 70% before shipment" /></Field>
      <Field label="Currency"><select name="currency" defaultValue={s?.currency ?? "USD"} className="input"><option>USD</option><option>CNY</option><option>GBP</option><option>EUR</option></select></Field>
      <Field label="Typical shipping cost per shipment"><input name="defaultShippingCost" type="number" step="0.01" defaultValue={String(s?.defaultShippingCost ?? "")} className="input" /></Field>
      <Field label="Internal notes" className="sm:col-span-2"><textarea name="notes" rows={2} defaultValue={s?.notes ?? ""} className="input" /></Field>
    </div>
  );
}

export function QuoteFields({ suppliers, hidden }: { suppliers: { id: string; companyName: string }[]; hidden: Record<string, string> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <Field label="Supplier" className="sm:col-span-2"><select name="supplierId" required className="input"><option value="">Select…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}</select></Field>
      <Field label="Unit price"><input name="unitPrice" type="number" step="0.01" min="0" required className="input" /></Field>
      <Field label="Currency"><select name="currency" className="input"><option>USD</option><option>CNY</option><option>GBP</option><option>EUR</option></select></Field>
      <Field label="MOQ"><input name="moq" type="number" min="1" defaultValue={1} className="input" /></Field>
      <Field label="Total shipping cost"><input name="shippingCost" type="number" step="0.01" min="0" defaultValue={0} className="input" /></Field>
      <Field label="Lead time (days)"><input name="leadTimeDays" type="number" min="0" className="input" /></Field>
      <Field label="Valid until"><input name="validUntil" type="date" className="input" /></Field>
      <Field label="Quotation file (PDF / image)" className="sm:col-span-2"><input name="file" type="file" className="input" /></Field>
      <Field label="Notes" className="sm:col-span-2"><textarea name="notes" rows={2} className="input" /></Field>
    </div>
  );
}
