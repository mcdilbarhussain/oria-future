import { Field } from "@/components/ui";
type L = { id?: string; ebayAccountId?: string; productId?: string | null; sku?: string; title?: string; description?: string | null; categoryId?: string | null; condition?: string; price?: unknown; quantity?: number; listingDuration?: string; imageUrls?: string[]; aspects?: unknown };
export function ListingFields({ l, accounts, products }: { l?: L; accounts: { id: string; name: string }[]; products: { id: string; sku: string; name: string; sellPrice: unknown }[] }) {
  const aspects = l?.aspects && typeof l.aspects === "object" ? Object.entries(l.aspects as Record<string, string[]>).map(([k, v]) => `${k}: ${v.join(", ")}`).join("\n") : "";
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {l?.id && <input type="hidden" name="id" value={l.id} />}
      {l?.id && <input type="hidden" name="keepImages" value="1" />}
      <Field label="eBay account"><select name="ebayAccountId" required defaultValue={l?.ebayAccountId} className="input">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Linked inventory product" hint="Links stock levels to this listing"><select name="productId" defaultValue={l?.productId ?? ""} className="input"><option value="">—</option>{products.map((p) => <option key={p.id} value={p.id}>{p.sku}</option>)}</select></Field>
      <Field label="SKU"><input name="sku" required defaultValue={l?.sku} className="input font-mono" /></Field>
      <Field label="Title (max 80 characters)" className="sm:col-span-3"><input name="title" required maxLength={80} defaultValue={l?.title} className="input" /></Field>
      <Field label="eBay category ID" hint="Find via eBay Taxonomy / category lookup"><input name="categoryId" defaultValue={l?.categoryId ?? ""} className="input" /></Field>
      <Field label="Condition"><select name="condition" defaultValue={l?.condition ?? "NEW"} className="input"><option value="NEW">New</option><option value="NEW_OTHER">New other</option><option value="LIKE_NEW">Like new</option><option value="USED_EXCELLENT">Used – excellent</option><option value="USED_GOOD">Used – good</option><option value="FOR_PARTS_OR_NOT_WORKING">For parts</option></select></Field>
      <Field label="Duration"><select name="listingDuration" defaultValue={l?.listingDuration ?? "GTC"} className="input"><option value="GTC">Good 'Til Cancelled</option><option value="DAYS_30">30 days</option><option value="DAYS_10">10 days</option><option value="DAYS_7">7 days</option></select></Field>
      <Field label="Price (£)"><input name="price" type="number" step="0.01" min="0" required defaultValue={String(l?.price ?? "")} className="input" /></Field>
      <Field label="Quantity"><input name="quantity" type="number" min="0" required defaultValue={l?.quantity ?? 1} className="input" /></Field>
      <div />
      <Field label="Description (HTML allowed)" className="sm:col-span-3"><textarea name="description" rows={6} defaultValue={l?.description ?? ""} className="input font-mono text-xs" /></Field>
      <Field label="Item specifics" hint="One per line – Name: value1, value2" className="sm:col-span-2"><textarea name="aspects" rows={4} defaultValue={aspects} className="input font-mono text-xs" placeholder={"Brand: Unbranded\nColour: Black"} /></Field>
      <Field label="Upload images" hint="JPEG/PNG – served publicly so eBay can fetch them"><input name="images" type="file" accept="image/*" multiple className="input" /></Field>
      <Field label="Image URLs (https, one per line)" className="sm:col-span-3"><textarea name="imageUrls" rows={2} defaultValue={l?.id ? "" : ""} className="input font-mono text-xs" /></Field>
    </div>
  );
}
