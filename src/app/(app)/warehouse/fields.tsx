import { Field } from "@/components/ui";
export function MovementFields({ products, warehouses }: { products: { id: string; sku: string; name: string }[]; warehouses: { id: string; name: string; isDefault: boolean }[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Product" className="sm:col-span-2"><select name="productId" required className="input">{products.length > 1 && <option value="">Select SKU…</option>}{products.map((p) => <option key={p.id} value={p.id}>{p.sku} – {p.name}</option>)}</select></Field>
      <Field label="Movement type"><select name="type" className="input"><option value="IN">Incoming stock (+)</option><option value="OUT">Outgoing stock (−)</option><option value="DAMAGED">Damaged / write-off (−)</option><option value="RETURN">Customer return (+)</option><option value="ADJUSTMENT">Stock count adjustment (= counted qty)</option></select></Field>
      <Field label="Warehouse"><select name="warehouseId" className="input" defaultValue={warehouses.find((w) => w.isDefault)?.id}>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
      <Field label="Quantity" hint="For adjustments enter the counted quantity"><input name="quantity" type="number" min="0" required className="input" /></Field>
      <Field label="Reference (PO, order, delivery note)"><input name="reference" className="input" /></Field>
      <Field label="Note" className="sm:col-span-2"><input name="note" className="input" /></Field>
    </div>
  );
}
