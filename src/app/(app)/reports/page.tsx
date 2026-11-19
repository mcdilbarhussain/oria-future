import Link from "next/link";
import { requirePage, ebayAccountScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { REPORTS, buildReport, type Col } from "@/lib/reports";
import { PageHeader, Card, TableWrap, Stat, Empty } from "@/components/ui";
import { AreaTrend, Bars } from "@/components/charts";
import { fmtMoney, fmtDate, fmtNum, label } from "@/lib/format";
import clsx from "clsx";

export const metadata = { title: "Reports & Analytics" };

const cell = (v: unknown, c: Col) => v === null || v === undefined || v === "" ? "—" : c.type === "money" ? fmtMoney(v) : c.type === "date" ? fmtDate(v as Date) : c.type === "number" ? fmtNum(v) : c.type === "percent" ? `${v}%` : c.key === "category" || c.key === "status" ? label(String(v)) : String(v);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("reports");
  const sp = await searchParams;
  const available = Object.entries(REPORTS).filter(([, r]) => u.can(...r.perm));
  const tab = sp.tab && available.some(([k]) => k === sp.tab) ? sp.tab : available[0]?.[0];
  const preset = sp.range ?? "30";
  const to = sp.to ? new Date(sp.to + "T23:59:59") : new Date();
  const from = sp.from ? new Date(sp.from) : preset === "mtd" ? new Date(to.getFullYear(), to.getMonth(), 1) : preset === "ytd" ? new Date(to.getFullYear(), 0, 1) : new Date(to.getTime() - Number(preset) * 86400_000);
  const accounts = await prisma.ebayAccount.findMany({ where: { deletedAt: null, ...ebayAccountScope(u) }, select: { id: true, name: true } });
  const r = tab ? await buildReport(tab, { from, to, account: sp.account }, u) : null;
  const qs = new URLSearchParams({ from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), ...(sp.account ? { account: sp.account } : {}) });
  const groups = [...new Set(available.map(([, r]) => r.group))];
  const canExport = u.can("reports", "export");
  return (
    <>
      <PageHeader title="Reports & Analytics" subtitle="Filter by date and eBay account. Export to PDF, CSV or Excel." />
      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <nav className="card h-fit p-2">
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <p className="px-3 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{g}</p>
              {available.filter(([, r]) => r.group === g).map(([k, r]) => <Link key={k} href={`?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, v]) => v)) as Record<string, string>, tab: k })}`} className={clsx("block rounded-lg px-3 py-1.5 text-sm", k === tab ? "bg-navy-800 text-white" : "text-slate-700 hover:bg-slate-100")}>{r.label}</Link>)}
            </div>
          ))}
        </nav>
        <div className="min-w-0">
          <form className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="tab" value={tab} />
            <label><span className="label">Range</span><select name="range" defaultValue={preset} className="input w-40"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="mtd">Month to date</option><option value="ytd">Year to date</option><option value="365">Last 12 months</option></select></label>
            <label><span className="label">From</span><input type="date" name="from" defaultValue={sp.from} className="input w-40" /></label>
            <label><span className="label">To</span><input type="date" name="to" defaultValue={sp.to} className="input w-40" /></label>
            <label><span className="label">eBay account</span><select name="account" defaultValue={sp.account} className="input w-52"><option value="">All</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <button className="btn-secondary">Apply</button>
            {canExport && r && <div className="ml-auto flex gap-2">{["pdf", "xlsx", "csv"].map((f) => <a key={f} href={`/api/export/${tab}?format=${f}&${qs}`} className="btn-secondary btn-sm uppercase">{f === "xlsx" ? "Excel" : f}</a>)}</div>}
          </form>
          {!r ? <Card><Empty title="No reports available for your role" /></Card> : (
            <>
              <h2 className="mb-1 text-lg font-bold">{r.title}</h2>
              <p className="mb-4 text-xs text-slate-500">{fmtDate(from)} – {fmtDate(to)}{tab === "pnl" && " · Actual = approved, realised transactions. Estimated adds forecasts/estimates (e.g. unpaid POs)."}</p>
              {r.summary && <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{r.summary.map(([k, v]) => <Stat key={k} label={k} value={typeof v === "number" && !/SKUs|Orders|Returns|Units/.test(k) ? fmtMoney(v) : fmtNum(v)} tone={k.includes("PROFIT") ? (Number(v) >= 0 ? "green" : "red") : k.toLowerCase().includes("estimated") ? "gold" : "navy"} />)}</div>}
              {r.chart && r.rows.length > 0 && (
                <Card className="mb-4">
                  {r.chart.kind === "area" ? <AreaTrend data={r.rows.map((x) => ({ ...x, label: x[r.chart!.x] instanceof Date ? (x[r.chart!.x] as Date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : String(x[r.chart!.x]) })) as Record<string, string | number>[]} keys={r.chart.y.map((k) => ({ key: k, label: label(k) }))} />
                    : <Bars data={r.rows.slice(0, 20).map((x) => ({ ...x, label: String(x[r.chart!.x]).replace(" (DEMO)", "") })) as Record<string, string | number>[]} keys={r.chart.y.map((k) => ({ key: k, label: label(k) }))} money={!["tasks"].includes(tab!)} />}
                </Card>
              )}
              <Card padded={false}>
                {r.rows.length === 0 ? <Empty title="No data for this period" /> : (
                  <TableWrap><table className="table"><thead><tr>{r.columns.map((c) => <th key={c.key} className={c.type && c.type !== "date" && c.type !== "text" ? "text-right" : ""}>{c.label}</th>)}</tr></thead><tbody>
                    {r.rows.slice(0, 500).map((row, i) => <tr key={i}>{r.columns.map((c) => <td key={c.key} className={clsx(c.type && c.type !== "date" && c.type !== "text" && "text-right", String(row[c.key]).startsWith("—") && "font-bold")}>{cell(row[c.key], c)}</td>)}</tr>)}
                  </tbody></table></TableWrap>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </>
  );
}
