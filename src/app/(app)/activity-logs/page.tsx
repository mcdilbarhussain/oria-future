import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MODULES } from "@/lib/permissions";
import { PageHeader, Card, FilterBar, Badge, TableWrap, Pagination } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Activity Logs" };
const PER = 50;

export default async function ActivityLogs({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("activity_logs");
  const sp = await searchParams;
  const tab = sp.tab === "logins" ? "logins" : "audit";
  const page = Math.max(1, Number(sp.page || 1));
  const from = sp.from ? new Date(sp.from) : undefined, to = sp.to ? new Date(sp.to + "T23:59:59") : undefined;
  const users = await prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return (
    <>
      <PageHeader title="Activity Logs" subtitle="Immutable audit trail of important changes and all sign-in attempts." actions={u.can("activity_logs", "export") || u.isSuperAdmin ? <a className="btn-secondary" href={`/api/export/audit?format=csv&${new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][])}`}>Export CSV</a> : null} />
      <div className="mb-4 flex gap-2">
        <Link href="?tab=audit" className={tab === "audit" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Audit trail</Link>
        <Link href="?tab=logins" className={tab === "logins" ? "btn-primary btn-sm" : "btn-secondary btn-sm"}>Login activity</Link>
      </div>
      <FilterBar>
        <input type="hidden" name="tab" value={tab} />
        <select name="user" defaultValue={sp.user} className="input w-48"><option value="">All users</option>{users.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
        {tab === "audit" && <select name="module" defaultValue={sp.module} className="input w-48"><option value="">All modules</option>{Object.entries(MODULES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
        {tab === "audit" && <input name="q" defaultValue={sp.q} placeholder="Search…" className="input w-48" />}
        <input type="date" name="from" defaultValue={sp.from} className="input w-40" /><input type="date" name="to" defaultValue={sp.to} className="input w-40" />
      </FilterBar>
      {tab === "audit" ? <AuditTable sp={sp} page={page} from={from} to={to} /> : <LoginTable sp={sp} page={page} from={from} to={to} />}
    </>
  );
}

async function AuditTable({ sp, page, from, to }: { sp: Record<string, string | undefined>; page: number; from?: Date; to?: Date }) {
  const where = { ...(sp.user ? { userId: sp.user } : {}), ...(sp.module ? { module: sp.module } : {}), ...(sp.q ? { summary: { contains: sp.q, mode: "insensitive" as const } } : {}), createdAt: { gte: from, lte: to } };
  const [rows, total] = await Promise.all([prisma.auditLog.findMany({ where, include: { user: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER }), prisma.auditLog.count({ where })]);
  return (
    <Card padded={false}>
      <TableWrap><table className="table"><thead><tr><th>When</th><th>User</th><th>Module</th><th>Action</th><th>Details</th><th>IP</th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</td><td>{r.user?.name ?? "System"}</td><td><Badge>{r.module}</Badge></td><td className="text-xs font-medium">{r.action}</td>
            <td className="max-w-lg"><p>{r.summary}</p>{(r.before || r.after) && <details className="text-xs text-slate-500"><summary className="cursor-pointer">Changes</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-slate-50 p-2">{JSON.stringify({ before: r.before, after: r.after }, null, 2)}</pre></details>}</td>
            <td className="text-xs text-slate-500">{r.ip}</td>
          </tr>
        ))}
      </tbody></table></TableWrap>
      <Pagination page={page} pages={Math.ceil(total / PER)} params={sp} />
    </Card>
  );
}

async function LoginTable({ sp, page, from, to }: { sp: Record<string, string | undefined>; page: number; from?: Date; to?: Date }) {
  const where = { ...(sp.user ? { userId: sp.user } : {}), createdAt: { gte: from, lte: to } };
  const [rows, total] = await Promise.all([prisma.loginLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER }), prisma.loginLog.count({ where })]);
  return (
    <Card padded={false}>
      <TableWrap><table className="table"><thead><tr><th>When</th><th>Email</th><th>Result</th><th>IP</th><th>Device</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td className="whitespace-nowrap text-xs">{fmtDateTime(r.createdAt)}</td><td>{r.email}</td><td>{r.success ? <Badge tone="green">Success{r.reason ? ` (${r.reason})` : ""}</Badge> : <Badge tone="red">{r.reason ?? "Failed"}</Badge>}</td><td className="text-xs">{r.ip}</td><td className="max-w-xs truncate text-xs text-slate-500">{r.userAgent}</td></tr>)}
      </tbody></table></TableWrap>
      <Pagination page={page} pages={Math.ceil(total / PER)} params={sp} />
    </Card>
  );
}
