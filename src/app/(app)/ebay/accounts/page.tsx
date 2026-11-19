import Link from "next/link";
import { requirePage, ebayAccountScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ebayCredentials } from "@/lib/ebay/config";
import { PageHeader, Card, StatusBadge, Badge, Field, Empty } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { fmtMoney, fmtDateTime } from "@/lib/format";
import { createEbayAccount } from "../actions";

export const metadata = { title: "eBay Accounts" };

export default async function EbayAccountsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const u = await requirePage("ebay_accounts");
  const { error } = await searchParams;
  const som = new Date(); som.setDate(1); som.setHours(0, 0, 0, 0);
  const accounts = await prisma.ebayAccount.findMany({ where: { deletedAt: null, ...ebayAccountScope(u) }, include: { _count: { select: { assignments: true, listings: { where: { status: "ACTIVE", deletedAt: null } }, threads: { where: { unread: true } } } } }, orderBy: { name: "asc" } });
  const sales = await prisma.ebayOrder.groupBy({ by: ["ebayAccountId"], where: { orderedAt: { gte: som }, ebayAccountId: { in: accounts.map((a) => a.id) } }, _sum: { total: true }, _count: true });
  const creds = ebayCredentials();
  return (
    <>
      <PageHeader title="eBay Accounts" subtitle="Multiple seller accounts connected through official eBay OAuth 2.0. Each account has its own dashboard." actions={u.can("ebay_accounts", "manage") && (
        <ModalForm trigger="+ Add eBay account" title="Add eBay seller account" action={createEbayAccount}>
          <Field label="Account name (internal)"><input name="name" required className="input" placeholder="e.g. ORIA Electronics UK" /></Field>
          <Field label="Short code"><input name="code" required className="input uppercase" placeholder="OF-ELEC" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Environment"><select name="environment" defaultValue={process.env.EBAY_ENVIRONMENT || "SANDBOX"} className="input"><option value="SANDBOX">Sandbox (testing)</option><option value="PRODUCTION">Production (live)</option></select></Field>
          <Field label="Marketplace"><select name="marketplaceId" className="input"><option>EBAY_GB</option><option>EBAY_US</option><option>EBAY_DE</option><option>EBAY_FR</option><option>EBAY_IT</option><option>EBAY_ES</option><option>EBAY_AU</option><option>EBAY_IE</option></select></Field></div>
          <Field label="Notes"><textarea name="notes" className="input" /></Field>
        </ModalForm>
      )} />
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
      {!creds.configured && u.can("ebay_accounts", "manage") && (
        <div className="mb-6 rounded-xl border border-gold-300 bg-gold-50 p-4 text-sm text-gold-900">
          <p className="font-semibold">eBay API credentials are not configured on the server.</p>
          <p className="mt-1">Set <code>EBAY_CLIENT_ID</code>, <code>EBAY_CLIENT_SECRET</code>, <code>EBAY_DEV_ID</code> and <code>EBAY_RUNAME</code> from developer.ebay.com, then use <b>Connect</b>. See <code>docs/EBAY_SETUP.md</code>. Accounts marked DEMO contain sample data only and are not connected to eBay.</p>
        </div>
      )}
      {accounts.length === 0 ? <Card><Empty title="No eBay accounts assigned to you" /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => { const s = sales.find((x) => x.ebayAccountId === a.id); return (
            <Link key={a.id} href={`/ebay/accounts/${a.id}`} className="card block p-5 transition hover:shadow-md">
              <div className="flex items-start justify-between gap-2"><div><h3 className="font-semibold">{a.name}</h3><p className="text-xs text-slate-500">{a.ebayUsername ?? "eBay user not linked"} · {a.marketplaceId} · {a.environment}</p></div><div className="flex flex-col items-end gap-1"><StatusBadge status={a.status} />{a.isDemo && <Badge tone="gold">DEMO</Badge>}</div></div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-lg font-bold">{s?._count ?? 0}</p><p className="text-[11px] text-slate-500">orders MTD</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-lg font-bold">{a._count.listings}</p><p className="text-[11px] text-slate-500">active listings</p></div>
                <div className="rounded-lg bg-slate-50 p-2"><p className="text-lg font-bold">{a._count.threads}</p><p className="text-[11px] text-slate-500">unread msgs</p></div>
              </div>
              <p className="mt-3 text-sm font-semibold text-navy-800">{fmtMoney(s?._sum.total ?? 0)} <span className="text-xs font-normal text-slate-500">sales this month</span></p>
              <p className="mt-1 text-xs text-slate-500">Last sync {fmtDateTime(a.lastSyncAt)} · {a._count.assignments} assigned employee(s)</p>
              {a.lastSyncError && <p className="mt-2 line-clamp-2 text-xs text-red-600">{a.lastSyncError}</p>}
            </Link>
          ); })}
        </div>
      )}
    </>
  );
}
