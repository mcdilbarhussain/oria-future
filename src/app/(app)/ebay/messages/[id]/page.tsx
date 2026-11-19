import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePage, canAccessEbayAccount } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, StatusBadge, Badge, DemoBadge, Field, Avatar } from "@/components/ui";
import { ActionButton, ActionForm, SubmitButton } from "@/components/forms";
import { fmtDateTime } from "@/lib/format";
import { assignThread, addNote, replyToBuyer, reviewReply, setThreadStatus } from "../../actions";
import { TemplatePicker } from "./template-picker";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requirePage("buyer_messages");
  const { id } = await params;
  const t = await prisma.buyerMessageThread.findUnique({ where: { id }, include: { ebayAccount: true, assignedTo: true, messages: { orderBy: { createdAt: "asc" } }, notes: { orderBy: { createdAt: "asc" } } } });
  if (!t || !canAccessEbayAccount(u, t.ebayAccountId)) notFound();
  if (t.unread) await prisma.buyerMessageThread.update({ where: { id }, data: { unread: false } });
  const [users, templates, orders] = await Promise.all([
    prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE" }, select: { id: true, name: true, avatarColor: true } }),
    prisma.replyTemplate.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" } }),
    prisma.ebayOrder.findMany({ where: { ebayAccountId: t.ebayAccountId, buyerUsername: t.buyerUsername }, orderBy: { orderedAt: "desc" }, take: 5 }),
  ]);
  const name = (x: string | null) => users.find((y) => y.id === x)?.name ?? "—";
  return (
    <>
      <PageHeader back={{ href: "/ebay/messages", label: "Buyer messages" }} title={t.subject} subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={t.status} />{t.important && <Badge tone="red">Important – replies need management review</Badge>}<DemoBadge show={t.isDemo} /> {t.buyerUsername} · {t.ebayAccount.name}{t.ebayItemId && ` · item ${t.ebayItemId}`}</span>} actions={u.can("buyer_messages", "edit") && (
        t.status === "CLOSED" ? <ActionButton action={setThreadStatus} fields={{ id, status: "ASSIGNED" }}>Reopen</ActionButton> : <ActionButton action={setThreadStatus} fields={{ id, status: "CLOSED" }}>Close conversation</ActionButton>
      )} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Conversation" padded={false}>
            <div className="space-y-3 bg-slate-50/60 p-4">
              {t.messages.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : ""}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${m.direction === "OUTBOUND" ? (m.status === "SENT" ? "bg-navy-800 text-white" : "bg-gold-50 ring-1 ring-gold-300") : "bg-white ring-1 ring-slate-200"}`}>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1 text-[11px] ${m.direction === "OUTBOUND" && m.status === "SENT" ? "text-navy-200" : "text-slate-500"}`}>{m.direction === "INBOUND" ? t.buyerUsername : name(m.authorId)} · {fmtDateTime(m.sentAt ?? m.createdAt)} {m.direction === "OUTBOUND" && <StatusBadge status={m.status} />}</p>
                    {m.error && <p className="mt-1 text-[11px] text-red-500">{m.error}</p>}
                    {m.status === "PENDING_REVIEW" && u.can("buyer_messages", "approve") && (
                      <ActionForm action={reviewReply} className="mt-2 flex gap-2"><input type="hidden" name="messageId" value={m.id} /><button name="decision" value="approve" className="btn-primary btn-sm">Approve & send</button><button name="decision" value="reject" className="btn-secondary btn-sm">Return</button></ActionForm>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {u.can("buyer_messages", "create") && t.status !== "CLOSED" && (
              <ActionForm action={replyToBuyer} className="space-y-2 border-t p-4">
                <input type="hidden" name="id" value={id} />
                <div className="flex items-center justify-between"><p className="label">Reply to {t.buyerUsername}</p><TemplatePicker templates={templates} /></div>
                <textarea id="reply-body" name="body" required rows={5} className="input" placeholder="Write your reply…" />
                <div className="flex flex-wrap justify-end gap-2">
                  <button name="mode" value="draft" className="btn-secondary">Save draft</button>
                  <SubmitButton>{t.important && !u.can("buyer_messages", "approve") ? "Submit for review" : !u.can("buyer_messages", "edit") ? "Submit for review" : t.ebayAccount.isDemo ? "Send (demo – not sent to eBay)" : "Send via eBay"}</SubmitButton>
                </div>
                <input type="hidden" name="mode" value="send" />
              </ActionForm>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          {u.can("buyer_messages", "edit") && (
            <Card title="Assignment">
              <ActionForm action={assignThread} resetOnSuccess={false} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <Field label="Assigned to"><select name="assignedToId" defaultValue={t.assignedToId ?? ""} className="input"><option value="">Unassigned</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="important" defaultChecked={t.important} /> Important (management review required)</label>
                <SubmitButton className="btn-secondary btn-sm">Update</SubmitButton>
              </ActionForm>
            </Card>
          )}
          <Card title="Internal notes (not visible to buyer)" padded={false}>
            <ul className="divide-y text-sm">{t.notes.map((n) => { const a = users.find((x) => x.id === n.userId); return <li key={n.id} className="flex gap-2 px-4 py-2.5"><Avatar name={a?.name ?? "?"} color={a?.avatarColor} size={22} /><div><p>{n.body}</p><p className="text-xs text-slate-400">{a?.name} · {fmtDateTime(n.createdAt)}</p></div></li>; })}</ul>
            <ActionForm action={addNote} className="flex gap-2 border-t p-3"><input type="hidden" name="id" value={id} /><input name="body" required className="input" placeholder="Add a note…" /><SubmitButton className="btn-secondary btn-sm">Add</SubmitButton></ActionForm>
          </Card>
          <Card title="Buyer's orders on this account" padded={false}>
            <ul className="divide-y text-sm">{orders.map((o) => <li key={o.id} className="flex justify-between px-4 py-2"><Link href={`/ebay/orders/${o.id}`} className="link font-mono text-xs">{o.orderId}</Link><StatusBadge status={o.orderStatus} /></li>)}{!orders.length && <li className="px-4 py-3 text-slate-500">No orders found</li>}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
