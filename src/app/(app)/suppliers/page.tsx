import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, FilterBar, Badge, DemoBadge, Empty } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { saveSupplier } from "./actions";
import { SupplierFields } from "./fields";

export const metadata = { title: "China Suppliers" };

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("suppliers");
  const sp = await searchParams;
  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null, ...(sp.q ? { OR: [{ companyName: { contains: sp.q, mode: "insensitive" } }, { contactPerson: { contains: sp.q, mode: "insensitive" } }, { city: { contains: sp.q, mode: "insensitive" } }] } : {}), ...(sp.cat ? { categories: { has: sp.cat } } : {}) },
    include: { _count: { select: { products: true, purchaseOrders: true, quotations: true } } }, orderBy: { companyName: "asc" },
  });
  const cats = [...new Set((await prisma.supplier.findMany({ where: { deletedAt: null }, select: { categories: true } })).flatMap((s) => s.categories))].sort();
  return (
    <>
      <PageHeader title="China Supplier Management" subtitle="Supplier profiles, catalogues, quotations and order history" actions={<>
        {u.can("enquiries", "view") && <Link href="/enquiries" className="btn-secondary">Price enquiries</Link>}
        {u.can("suppliers", "create") && <ModalForm trigger="+ Add supplier" title="New supplier" action={saveSupplier} wide><SupplierFields /></ModalForm>}
      </>} />
      <FilterBar>
        <input name="q" defaultValue={sp.q} placeholder="Company, contact, city…" className="input w-64" />
        <select name="cat" defaultValue={sp.cat} className="input w-48"><option value="">All categories</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
      </FilterBar>
      {suppliers.length === 0 ? <Card><Empty title="No suppliers yet" /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s) => (
            <Link key={s.id} href={`/suppliers/${s.id}`} className="card block p-5 transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-navy-900">{s.companyName}</h3><DemoBadge show={s.isDemo} /></div>
              <p className="mt-0.5 text-sm text-slate-500">{[s.city, s.province, s.country].filter(Boolean).join(", ")}</p>
              <p className="mt-2 text-sm">{s.contactPerson} {s.wechat && <span className="text-xs text-slate-500">· WeChat {s.wechat}</span>}</p>
              <div className="mt-3 flex flex-wrap gap-1">{s.categories.map((c) => <Badge key={c} tone="navy">{c}</Badge>)}</div>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-500"><span>{s._count.products} products · {s._count.quotations} quotes · {s._count.purchaseOrders} POs</span><span className="font-semibold text-gold-600">{s.rating ? `★ ${s.rating}` : "Unrated"}</span></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
