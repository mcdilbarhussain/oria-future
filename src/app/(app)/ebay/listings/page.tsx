import Link from "next/link";
import { requirePage, ebayAccountScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { ListingStatus, Prisma } from "@prisma/client";
import { PageHeader, Card, FilterBar, TableWrap, StatusBadge, DemoBadge, Pagination, Stat, Empty } from "@/components/ui";
import { fmtMoney, fmtDateTime } from "@/lib/format";

export const metadata = { title: "eBay Listings" };
const PER = 50;

export default async function ListingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("ebay_listings");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const accounts = await prisma.ebayAccount.findMany({ where: { deletedAt: null, ...ebayAccountScope(u) }, select: { id: true, name: true } });
  const ids = accounts.map((a) => a.id);
  const base: Prisma.EbayListingWhereInput = { deletedAt: null, ebayAccountId: sp.account && ids.includes(sp.account) ? sp.account : { in: ids } };
  const where: Prisma.EbayListingWhereInput = { ...base, ...(sp.status ? { status: sp.status as ListingStatus } : {}), ...(sp.sold === "sold" ? { soldQuantity: { gt: 0 } } : sp.sold === "unsold" ? { soldQuantity: 0 } : {}), ...(sp.q ? { OR: [{ sku: { contains: sp.q, mode: "insensitive" } }, { title: { contains: sp.q, mode: "insensitive" } }, { ebayItemId: { contains: sp.q } }] } : {}) };
  const [rows, total, counts, users] = await Promise.all([
    prisma.ebayListing.findMany({ where, include: { ebayAccount: true }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PER, take: PER }),
    prisma.ebayListing.count({ where }),
    prisma.ebayListing.groupBy({ by: ["status"], where: base, _count: true }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const who = (id: string | null) => users.find((x) => x.id === id)?.name ?? "Sync";
  return (
    <>
      <PageHeader title="eBay Listing Management" subtitle="Create, publish, revise and end listings across your eBay accounts" actions={<>
        {u.can("ebay_listings", "export") && <a className="btn-secondary" href={`/api/export/listings?format=xlsx`}>Export</a>}
        {u.can("ebay_listings", "create") && <Link href="/ebay/listings/new" className="btn-primary">+ New listing</Link>}
      </>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Active" value={n("ACTIVE")} tone="green" href="?status=ACTIVE" /><Stat label="Out of stock" value={n("OUT_OF_STOCK")} tone="red" href="?status=OUT_OF_STOCK" />
        <Stat label="Drafts" value={n("DRAFT")} tone="slate" href="?status=DRAFT" /><Stat label="Errors" value={n("ERROR")} tone="red" href="?status=ERROR" /><Stat label="Ended / unsold" value={n("ENDED")} tone="slate" href="?status=ENDED" />
      </div>
      <FilterBar>
        <input name="q" defaultValue={sp.q} placeholder="SKU, title, item ID" className="input w-56" />
        <select name="account" defaultValue={sp.account} className="input w-56"><option value="">All my accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select name="status" defaultValue={sp.status} className="input w-40"><option value="">Any status</option>{["DRAFT", "PUBLISHING", "ACTIVE", "OUT_OF_STOCK", "ENDED", "ERROR"].map((s) => <option key={s}>{s}</option>)}</select>
        <select name="sold" defaultValue={sp.sold} className="input w-36"><option value="">Sold + unsold</option><option value="sold">Sold</option><option value="unsold">Unsold</option></select>
      </FilterBar>
      <Card padded={false}>
        {rows.length === 0 ? <Empty title="No listings" /> : (
          <TableWrap><table className="table"><thead><tr><th>Listing</th><th>Account</th><th className="text-right">Price</th><th className="text-right">Qty</th><th className="text-right">Sold</th><th className="text-right">Views / watchers</th><th>Status</th><th>Last edited by</th></tr></thead><tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="max-w-sm"><Link href={`/ebay/listings/${l.id}`} className="link line-clamp-1">{l.title}</Link><p className="font-mono text-xs text-slate-500">{l.sku}{l.ebayItemId ? ` · ${l.ebayItemId}` : ""} <DemoBadge show={l.isDemo} /></p>{l.lastError && <p className="line-clamp-1 text-xs text-red-600">{l.lastError}</p>}</td>
                <td className="text-xs">{l.ebayAccount.name}</td><td className="text-right">{fmtMoney(l.price, l.currency)}</td><td className="text-right">{l.quantity}</td><td className="text-right">{l.soldQuantity}</td><td className="text-right text-xs">{l.views} / {l.watchers}</td>
                <td><StatusBadge status={l.status} /></td><td className="text-xs">{who(l.updatedById ?? l.createdById)}<p className="text-slate-400">{fmtDateTime(l.updatedAt)}</p></td>
              </tr>
            ))}
          </tbody></table></TableWrap>
        )}
        <Pagination page={page} pages={Math.ceil(total / PER)} params={sp} />
      </Card>
    </>
  );
}
