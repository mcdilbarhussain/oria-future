import Link from "next/link";
import { requirePage, ebayAccountScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma, ThreadStatus } from "@prisma/client";
import { PageHeader, Card, FilterBar, StatusBadge, Badge, DemoBadge, Empty, Field } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { timeAgo } from "@/lib/format";
import { saveTemplate } from "../actions";

export const metadata = { title: "Buyer Messages" };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("buyer_messages");
  const sp = await searchParams;
  const accounts = await prisma.ebayAccount.findMany({ where: { deletedAt: null, ...ebayAccountScope(u) }, select: { id: true, name: true } });
  const ids = accounts.map((a) => a.id);
  const where: Prisma.BuyerMessageThreadWhereInput = {
    ebayAccountId: sp.account && ids.includes(sp.account) ? sp.account : { in: ids },
    ...(sp.status ? { status: sp.status as ThreadStatus } : { status: { not: "CLOSED" } }), ...(sp.unread ? { unread: true } : {}), ...(sp.mine ? { assignedToId: u.id } : {}),
    ...(sp.q ? { OR: [{ buyerUsername: { contains: sp.q, mode: "insensitive" } }, { subject: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const threads = await prisma.buyerMessageThread.findMany({ where, include: { ebayAccount: true, assignedTo: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ unread: "desc" }, { lastMessageAt: "desc" }], take: 200 });
  const grouped = accounts.map((a) => ({ a, items: threads.filter((t) => t.ebayAccountId === a.id) })).filter((g) => g.items.length);
  return (
    <>
      <PageHeader title="Buyer Messages" subtitle="Customer service inbox – organised by eBay account" actions={u.can("buyer_messages", "create") && (
        <ModalForm trigger="+ Reply template" triggerClassName="btn-secondary" title="Saved reply template" action={saveTemplate}>
          <Field label="Name"><input name="name" required className="input" /></Field><Field label="Category"><input name="category" className="input" /></Field>
          <Field label="Body" hint="Use {buyer} for the buyer's username"><textarea name="body" required rows={6} className="input" /></Field>
        </ModalForm>
      )} />
      <FilterBar>
        <input name="q" defaultValue={sp.q} placeholder="Buyer or subject" className="input w-48" />
        <select name="account" defaultValue={sp.account} className="input w-56"><option value="">All my accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select name="status" defaultValue={sp.status} className="input w-44"><option value="">Open conversations</option>{["NEW", "ASSIGNED", "AWAITING_REVIEW", "REPLIED", "CLOSED"].map((s) => <option key={s}>{s}</option>)}</select>
        <label className="flex items-center gap-1.5 px-2 text-sm"><input type="checkbox" name="unread" value="1" defaultChecked={!!sp.unread} /> Unread</label>
        <label className="flex items-center gap-1.5 px-2 text-sm"><input type="checkbox" name="mine" value="1" defaultChecked={!!sp.mine} /> Assigned to me</label>
      </FilterBar>
      {grouped.length === 0 ? <Card><Empty title="Inbox zero 🎉" /></Card> : grouped.map(({ a, items }) => (
        <Card key={a.id} title={`${a.name} (${items.length})`} padded={false} className="mb-4">
          <ul className="divide-y">{items.map((t) => (
            <li key={t.id}>
              <Link href={`/ebay/messages/${t.id}`} className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 ${t.unread ? "bg-navy-50/50" : ""}`}>
                <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${t.unread ? "bg-gold-500" : "bg-transparent"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${t.unread ? "font-bold" : "font-medium"}`}>{t.subject} {t.important && <Badge tone="red">Important</Badge>} <DemoBadge show={t.isDemo} /></p>
                  <p className="truncate text-sm text-slate-600"><b className="font-medium">{t.buyerUsername}:</b> {t.messages[0]?.body}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1"><span className="text-xs text-slate-400">{timeAgo(t.lastMessageAt)}</span><StatusBadge status={t.status} />{t.assignedTo && <span className="text-xs text-slate-500">{t.assignedTo.name}</span>}</div>
              </Link>
            </li>
          ))}</ul>
        </Card>
      ))}
    </>
  );
}
