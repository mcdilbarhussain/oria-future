import Link from "next/link";
import clsx from "clsx";
import type { ReactNode } from "react";
import { label } from "@/lib/format";

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {back && <Link href={back.href} className="mb-1 inline-block text-xs font-medium text-slate-500 hover:text-navy-700">← {back.label}</Link>}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, padded = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={clsx("card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
          {actions}
        </div>
      )}
      <div className={clsx(padded && "p-4")}>{children}</div>
    </section>
  );
}

export function Stat({ label: l, value, hint, tone = "navy", href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "navy" | "gold" | "green" | "red" | "slate"; href?: string }) {
  const bar = { navy: "bg-navy-700", gold: "bg-gold-500", green: "bg-emerald-500", red: "bg-red-500", slate: "bg-slate-400" }[tone];
  const inner = (
    <div className="card relative overflow-hidden p-4 transition hover:shadow-md">
      <span className={clsx("absolute inset-y-0 left-0 w-1", bar)} />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{l}</p>
      <p className="mt-1.5 text-2xl font-bold text-navy-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const TONES: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  navy: "bg-navy-50 text-navy-700 ring-navy-600/20",
  gold: "bg-gold-50 text-gold-700 ring-gold-600/30",
  slate: "bg-slate-100 text-slate-600 ring-slate-500/20",
  purple: "bg-purple-50 text-purple-700 ring-purple-600/20",
};
export function Badge({ children, tone = "slate", className }: { children: ReactNode; tone?: keyof typeof TONES | string; className?: string }) {
  return <span className={clsx("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone] ?? TONES.slate, className)}>{children}</span>;
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "green", CONNECTED: "green", COMPLETED: "green", APPROVED: "green", RECEIVED: "green", PAID: "green", FULFILLED: "green", SENT: "green", SUCCESS: "green", REPLIED: "green",
  PENDING: "amber", PENDING_APPROVAL: "amber", WAITING_APPROVAL: "amber", SUBMITTED: "amber", OUTSTANDING: "amber", PUBLISHING: "amber", AWAITING_REVIEW: "amber", PENDING_REVIEW: "amber", QUOTING: "amber", NOT_STARTED: "amber", IN_TRANSIT: "blue", SHIPPED: "blue", CUSTOMS: "blue",
  IN_PROGRESS: "blue", ASSIGNED: "blue", MANAGEMENT_REVIEWED: "blue", QUOTATION_REQUESTED: "blue", QUOTED: "blue", FINANCE_REVIEWED: "purple", ORDERED: "navy", NEW: "navy", OPEN: "navy", RECOMMENDED: "purple", DRAFT: "slate",
  SUSPENDED: "red", REJECTED: "red", OVERDUE: "red", ERROR: "red", FAILED: "red", EXPIRED: "red", DISCONNECTED: "red", CANCELLED: "slate", ENDED: "slate", CLOSED: "slate", OUT_OF_STOCK: "red", SKIPPED: "slate",
  URGENT: "red", HIGH: "amber", MEDIUM: "blue", LOW: "slate", FULLY_REFUNDED: "red", PARTIALLY_REFUNDED: "amber",
};
export function StatusBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return <Badge tone={STATUS_TONE[status] ?? "slate"}>{label(status)}</Badge>;
}

export function DemoBadge({ show = true }: { show?: boolean }) {
  return show ? <Badge tone="gold" className="uppercase tracking-wide">Demo</Badge> : null;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 h-10 w-10 rounded-full bg-navy-50 ring-8 ring-navy-50/50" />
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {children && <div className="mt-1 text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-px overflow-x-auto">{children}</div>;
}

export function Field({ label: l, children, hint, className }: { label: string; children: ReactNode; hint?: string; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="label">{l}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Avatar({ name, color, size = 32, online }: { name: string; color?: string; size?: number; online?: boolean }) {
  const ini = name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="relative inline-flex shrink-0">
      <span className="inline-flex items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, background: color ?? "#253d74", fontSize: size * 0.38 }}>{ini}</span>
      {online !== undefined && <span className={clsx("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white", online ? "bg-emerald-500" : "bg-slate-300")} />}
    </span>
  );
}

/** GET-based filter bar – works without JavaScript and keeps filters in the URL. */
export function FilterBar({ children, action }: { children: ReactNode; action?: string }) {
  return (
    <form method="get" action={action} className="mb-4 flex flex-wrap items-end gap-2">
      {children}
      <button className="btn-secondary" type="submit">Apply</button>
    </form>
  );
}

export function Pagination({ page, pages, params }: { page: number; pages: number; params: Record<string, string | undefined> }) {
  if (pages <= 1) return null;
  const href = (p: number) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)) as Record<string, string>, page: String(p) }).toString();
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm">
      <span className="text-slate-500">Page {page} of {pages}</span>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-secondary btn-sm" href={href(page - 1)}>Previous</Link>}
        {page < pages && <Link className="btn-secondary btn-sm" href={href(page + 1)}>Next</Link>}
      </div>
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
