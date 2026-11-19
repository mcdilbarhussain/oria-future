import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Badge, Empty, Pagination } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { fmtDateTime, label } from "@/lib/format";
import { markAllRead } from "./actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ page?: string; unread?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const where = { userId: u.id, ...(sp.unread ? { readAt: null } : {}) };
  const [items, total] = await Promise.all([prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30 }), prisma.notification.count({ where })]);
  return (
    <>
      <PageHeader title="Notifications" subtitle="Real-time alerts for orders, messages, tasks, stock, purchasing and approvals." actions={<>
        <Link href={sp.unread ? "?" : "?unread=1"} className="btn-secondary">{sp.unread ? "Show all" : "Unread only"}</Link>
        <ActionButton action={markAllRead} className="btn-primary">Mark all as read</ActionButton>
      </>} />
      <Card padded={false}>
        {items.length === 0 ? <Empty title="No notifications" /> : (
          <ul className="divide-y">{items.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 px-4 py-3 ${n.readAt ? "" : "bg-navy-50/50"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-gold-500"}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title} <Badge className="ml-1">{label(n.type)}</Badge></p>
                {n.body && <p className="text-sm text-slate-600">{n.body}</p>}
              </div>
              <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(n.createdAt)}</span>
            </li>
          ))}</ul>
        )}
        <Pagination page={page} pages={Math.ceil(total / 30)} params={sp} />
      </Card>
    </>
  );
}
