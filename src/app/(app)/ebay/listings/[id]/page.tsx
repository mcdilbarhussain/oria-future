import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage, ebayAccountScope, canAccessEbayAccount } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, KV, StatusBadge, DemoBadge } from "@/components/ui";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { saveListing, listingOp } from "../../actions";
import { ListingFields } from "../form";

export default async function ListingDetail({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("ebay_listings");
  const { id } = await params;
  const l = await prisma.ebayListing.findFirst({ where: { id, deletedAt: null }, include: { ebayAccount: true, product: true } });
  if (!l || !canAccessEbayAccount(u, l.ebayAccountId)) notFound();
  const [accounts, products, users, history] = await Promise.all([
    prisma.ebayAccount.findMany({ where: { deletedAt: null, ...ebayAccountScope(u) }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, sku: true, name: true, sellPrice: true }, orderBy: { sku: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.auditLog.findMany({ where: { entity: "EbayListing", entityId: id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const who = (x: string | null) => users.find((y) => y.id === x)?.name ?? "eBay sync";
  const live = ["ACTIVE", "OUT_OF_STOCK"].includes(l.status);
  return (
    <>
      <PageHeader back={{ href: "/ebay/listings", label: "Listings" }} title={l.title} subtitle={<span className="flex items-center gap-2"><StatusBadge status={l.status} /><DemoBadge show={l.isDemo} /> {l.ebayAccount.name} · <span className="font-mono">{l.sku}</span></span>} actions={<>
        {u.can("ebay_listings", "edit") && ["DRAFT", "ERROR", "ENDED"].includes(l.status) && <ActionButton action={listingOp} fields={{ id, op: "publish" }} className="btn-gold" pendingText="Publishing…">{l.status === "ENDED" ? "Relist on eBay" : "Publish to eBay"}</ActionButton>}
        {u.can("ebay_listings", "edit") && live && <ActionButton action={listingOp} fields={{ id, op: "end" }} className="btn-secondary" confirm="End this listing on eBay?">End listing</ActionButton>}
        {u.can("ebay_listings", "delete") && !live && <ActionButton action={listingOp} fields={{ id, op: "delete" }} className="btn-ghost text-red-600" confirm="Delete this listing record?">Delete</ActionButton>}
      </>} />
      {l.lastError && <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200"><b>Last eBay error:</b> {l.lastError}</div>}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Edit listing" className="xl:col-span-2">
          {u.can("ebay_listings", "edit") ? (
            <ActionForm action={saveListing} resetOnSuccess={false}>
              <ListingFields l={l} accounts={accounts} products={products} />
              <div className="mt-6 flex items-center justify-end gap-3"><p className="text-xs text-slate-500">{live ? "Price/quantity changes on live listings are revised on eBay immediately." : ""}</p><SubmitButton>Save changes</SubmitButton></div>
            </ActionForm>
          ) : <p className="text-sm text-slate-500">Read-only access.</p>}
        </Card>
        <div className="space-y-6">
          <Card title="Performance">
            <KV items={[["Price", fmtMoney(l.price, l.currency)], ["Available", l.quantity], ["Sold", l.soldQuantity], ["Views", l.views], ["Watchers", l.watchers], ["eBay item ID", l.ebayItemId ?? "—"], ["Offer ID", l.offerId ?? "—"], ["Published", fmtDateTime(l.lastPublishedAt)], ["Linked SKU", l.product ? <Link key="p" className="link" href={`/inventory/${l.product.id}`}>{l.product.sku}</Link> : "—"]]} />
            {l.ebayItemId && !l.isDemo && <a target="_blank" rel="noreferrer" className="link mt-3 block text-sm" href={`https://www.${l.ebayAccount.environment === "SANDBOX" ? "sandbox." : ""}ebay.co.uk/itm/${l.ebayItemId}`}>View on eBay ↗</a>}
          </Card>
          <Card title="Images">
            <div className="grid grid-cols-3 gap-2">{l.imageUrls.map((src) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={src} src={src} alt="" className="aspect-square rounded-lg border object-cover" />)}</div>
            {!l.imageUrls.length && <p className="text-sm text-slate-500">No images</p>}
          </Card>
          <Card title="Change history" padded={false}>
            <ul className="divide-y text-sm"><li className="px-4 py-2 text-xs text-slate-500">Created by {who(l.createdById)} · last updated by {who(l.updatedById)}</li>{history.map((h) => <li key={h.id} className="px-4 py-2"><p>{h.user?.name ?? "System"}: {h.summary}</p><p className="text-xs text-slate-400">{fmtDateTime(h.createdAt)}</p></li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
