import Link from "next/link";
import { requireUser, ebayAccountScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, StatusBadge } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  const ci = { contains: q, mode: "insensitive" as const };
  const scope = ebayAccountScope(u);
  const [products, orders, suppliers, employees, tasks, listings] = q.length < 2 ? [[], [], [], [], [], []] : await Promise.all([
    u.can("inventory", "view") ? prisma.product.findMany({ where: { deletedAt: null, OR: [{ sku: ci }, { name: ci }, { barcode: ci }] }, take: 10 }) : [],
    u.can("ebay_orders", "view") ? prisma.ebayOrder.findMany({ where: { ebayAccount: scope, OR: [{ orderId: ci }, { buyerUsername: ci }, { trackingNumber: ci }] }, take: 10 }) : [],
    u.can("suppliers", "view") ? prisma.supplier.findMany({ where: { deletedAt: null, OR: [{ companyName: ci }, { contactPerson: ci }] }, take: 10 }) : [],
    u.can("employees", "view") ? prisma.user.findMany({ where: { deletedAt: null, OR: [{ name: ci }, { email: ci }] }, take: 10 }) : [],
    u.can("tasks", "view") ? prisma.task.findMany({ where: { deletedAt: null, title: ci, ...(u.can("tasks", "manage") ? {} : { OR: [{ assigneeId: u.id }, { createdById: u.id }] }) }, take: 10 }) : [],
    u.can("ebay_listings", "view") ? prisma.ebayListing.findMany({ where: { deletedAt: null, ebayAccount: scope, OR: [{ sku: ci }, { title: ci }, { ebayItemId: ci }] }, take: 10 }) : [],
  ]);
  const sections: [string, { href: string; title: string; sub?: string; status?: string }[]][] = [
    ["Products", products.map((p) => ({ href: `/inventory/${p.id}`, title: p.sku, sub: p.name }))],
    ["eBay orders", orders.map((o) => ({ href: `/ebay/orders/${o.id}`, title: o.orderId, sub: o.buyerUsername ?? "", status: o.paymentStatus ?? undefined }))],
    ["Listings", listings.map((l) => ({ href: `/ebay/listings/${l.id}`, title: l.title, sub: l.sku, status: l.status }))],
    ["Suppliers", suppliers.map((s) => ({ href: `/suppliers/${s.id}`, title: s.companyName, sub: s.city ?? "" }))],
    ["Employees", employees.map((e) => ({ href: `/employees/${e.id}`, title: e.name, sub: e.email }))],
    ["Tasks", tasks.map((t) => ({ href: `/tasks/${t.id}`, title: t.title, status: t.status }))],
  ];
  const any = sections.some(([, r]) => r.length);
  return (
    <>
      <PageHeader title={`Search: “${q}”`} subtitle="Results are limited to the modules and eBay accounts you can access." />
      {!any && <p className="text-sm text-slate-500">{q.length < 2 ? "Type at least 2 characters." : "No results."}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {sections.filter(([, r]) => r.length).map(([t, rows]) => (
          <Card key={t} title={t} padded={false}><ul className="divide-y">{rows.map((r) => <li key={r.href}><Link href={r.href} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50"><span><span className="block text-sm font-medium">{r.title}</span>{r.sub && <span className="text-xs text-slate-500">{r.sub}</span>}</span>{r.status && <StatusBadge status={r.status} />}</Link></li>)}</ul></Card>
        ))}
      </div>
    </>
  );
}
