import { Field } from "@/components/ui";
type P = { id?: string; sku?: string; name?: string; barcode?: string | null; category?: string | null; brand?: string | null; description?: string | null; costPrice?: unknown; sellPrice?: unknown; reorderLevel?: number; reorderQty?: number; weightKg?: unknown; preferredSupplierId?: string | null; imageUrl?: string | null };
export function ProductFields({ p, suppliers }: { p?: P; suppliers: { id: string; companyName: string }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {p?.id && <input type="hidden" name="id" value={p.id} />}
      <Field label="SKU"><input name="sku" required defaultValue={p?.sku} className="input font-mono uppercase" /></Field>
      <Field label="Barcode (EAN/UPC)"><input name="barcode" defaultValue={p?.barcode ?? ""} className="input font-mono" /></Field>
      <Field label="Category"><input name="category" defaultValue={p?.category ?? ""} className="input" /></Field>
      <Field label="Product name" className="sm:col-span-2"><input name="name" required defaultValue={p?.name} className="input" /></Field>
      <Field label="Brand"><input name="brand" defaultValue={p?.brand ?? ""} className="input" /></Field>
      <Field label="Cost price (£)"><input name="costPrice" type="number" step="0.01" min="0" required defaultValue={String(p?.costPrice ?? "")} className="input" /></Field>
      <Field label="Selling price (£)"><input name="sellPrice" type="number" step="0.01" min="0" required defaultValue={String(p?.sellPrice ?? "")} className="input" /></Field>
      <Field label="Weight (kg)"><input name="weightKg" type="number" step="0.001" min="0" defaultValue={String(p?.weightKg ?? "")} className="input" /></Field>
      <Field label="Reorder level"><input name="reorderLevel" type="number" min="0" defaultValue={p?.reorderLevel ?? 10} className="input" /></Field>
      <Field label="Reorder quantity"><input name="reorderQty" type="number" min="1" defaultValue={p?.reorderQty ?? 50} className="input" /></Field>
      <Field label="Preferred supplier"><select name="preferredSupplierId" defaultValue={p?.preferredSupplierId ?? ""} className="input"><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}</select></Field>
      {!p?.id && <Field label="Opening stock (default warehouse)"><input name="openingQty" type="number" min="0" defaultValue={0} className="input" /></Field>}
      <Field label="Image URL" className={p?.id ? "sm:col-span-3" : "sm:col-span-2"}><input name="imageUrl" defaultValue={p?.imageUrl ?? ""} className="input" /></Field>
      <Field label="Description" className="sm:col-span-3"><textarea name="description" rows={3} defaultValue={p?.description ?? ""} className="input" /></Field>
    </div>
  );
}
