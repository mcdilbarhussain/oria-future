import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, FilterBar, TableWrap, Badge, DemoBadge, Stat, Pagination, Empty } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { fmtMoney, fmtNum } from "@/lib/format";
import { saveProduct } from "./actions";
import { ProductFields } from "./fields";
import { stockValue } from "@/lib/queries";

export const metadata = { title: "Inventory" };
const PER = 50;

export default async function InventoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("inventory");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const q = sp.q?.trim();
  const rows = await prisma.$queryRawUnsafe<{ id: string; sku: string; name: string; barcode: string | null; category: string | null; costPrice: number; sellPrice: number; reorderLevel: number; isDemo: boolean; qty: number; listings: number }[]>(
    `SELECT p.id, p.sku, p.name, p.barcode, p.category, p."costPrice"::float AS "costPrice", p."sellPrice"::float AS "sellPrice", p."reorderLevel", p."isDemo",
       COALESCE((SELECT SUM(quantity) FROM "StockLevel" s WHERE s."productId" = p.id),0)::int AS qty,
       (SELECT COUNT(*) FROM "EbayListing" l WHERE l."productId" = p.id AND l."deletedAt" IS NULL AND l.status IN ('ACTIVE','OUT_OF_STOCK'))::int AS listings
     FROM "Product" p WHERE p."deletedAt" IS NULL
     ${q ? `AND (p.sku ILIKE $1 OR p.name ILIKE $1 OR p.barcode ILIKE $1)` : ""}
     ${sp.category ? `AND p.category = ${q ? "$2" : "$1"}` : ""}
     ORDER BY p.sku`, ...[q ? `%${q}%` : null, sp.category ?? null].filter((x) => x !== null));
  const filtered = sp.filter === "low" ? rows.filter((r) => r.qty <= r.reorderLevel) : sp.filter === "out" ? rows.filter((r) => r.qty <= 0) : rows;
  const pageRows = filtered.slice((page - 1) * PER, page * PER);
  const [cats, suppliers, sv] = await Promise.all([
    prisma.product.findMany({ where: { deletedAt: null, category: { not: null } }, distinct: ["category"], select: { category: true } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true } }),
    stockValue(),
  ]);
  const exportQs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
  return (
    <>
      <PageHeader title="Inventory Management" subtitle="UK warehouse stock, SKUs and barcodes" actions={<>
        {u.can("inventory", "export") && <><a className="btn-secondary" href={`/api/export/stock?format=xlsx&${exportQs}`}>Excel</a><a className="btn-secondary" href={`/api/export/stock?format=csv&${exportQs}`}>CSV</a></>}
        {u.can("inventory", "create") && <ModalForm trigger="+ Add product" title="New product" action={saveProduct} wide><ProductFields suppliers={suppliers} /></ModalForm>}
      </>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active SKUs" value={fmtNum(rows.length)} />
        <Stat label="Units in stock" value={fmtNum(sv.units)} />
        <Stat label="Stock value (cost)" value={fmtMoney(sv.value)} tone="gold" />
        <Stat label="Low / out of stock" value={`${rows.filter((r) => r.qty <= r.reorderLevel).length} / ${rows.filter((r) => r.qty <= 0).length}`} tone="red" href="?filter=low" />
      </div>
      <FilterBar>
        <input name="q" defaultValue={sp.q} placeholder="SKU, name or barcode…" className="input w-64" autoFocus={!!sp.scan} />
        <select name="category" defaultValue={sp.category} className="input w-48"><option value="">All categories</option>{cats.map((c) => <option key={c.category!} value={c.category!}>{c.category}</option>)}</select>
        <select name="filter" defaultValue={sp.filter} className="input w-40"><option value="">All stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
      </FilterBar>
      <Card padded={false}>
        {pageRows.length === 0 ? <Empty title="No products found" /> : (
          <TableWrap><table className="table"><thead><tr><th>SKU</th><th>Product</th><th>Barcode</th><th>Category</th><th className="text-right">Cost</th><th className="text-right">Price</th><th className="text-right">Margin</th><th className="text-right">Stock</th><th>eBay</th></tr></thead><tbody>
            {pageRows.map((p) => {
              const margin = p.sellPrice ? ((p.sellPrice - p.costPrice) / p.sellPrice) * 100 : 0;
              return (
                <tr key={p.id}>
                  <td><Link href={`/inventory/${p.id}`} className="link font-mono text-xs">{p.sku}</Link></td>
                  <td className="max-w-xs"><span className="line-clamp-1">{p.name}</span> <DemoBadge show={p.isDemo} /></td>
                  <td className="font-mono text-xs text-slate-500">{p.barcode ?? "—"}</td><td>{p.category ?? "—"}</td>
                  <td className="text-right">{fmtMoney(p.costPrice)}</td><td className="text-right">{fmtMoney(p.sellPrice)}</td><td className="text-right text-xs">{margin.toFixed(0)}%</td>
                  <td className="text-right">{p.qty <= 0 ? <Badge tone="red">Out</Badge> : p.qty <= p.reorderLevel ? <Badge tone="amber">{p.qty} low</Badge> : <b>{fmtNum(p.qty)}</b>}</td>
                  <td>{p.listings ? <Badge tone="blue">{p.listings} live</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
                </tr>
              );
            })}
          </tbody></table></TableWrap>
        )}
        <Pagination page={page} pages={Math.ceil(filtered.length / PER)} params={sp} />
      </Card>
    </>
  );
}
