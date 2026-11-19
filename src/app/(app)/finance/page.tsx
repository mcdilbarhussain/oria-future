import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card, Stat, TableWrap, Field, Badge } from "@/components/ui";
import { ModalForm } from "@/components/forms";
import { AreaTrend, Donut } from "@/components/charts";
import { fmtMoney, fmtDate, label } from "@/lib/format";
import { financeTotals } from "@/lib/queries";
import { saveFinanceAccount } from "./actions";

export const metadata = { title: "Finance Dashboard" };

export default async function FinanceDashboard() {
  const u = await requirePage("finance");
  const now = new Date();
  const som = new Date(now.getFullYear(), now.getMonth(), 1);
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const [month, accounts, balances, monthly, cats, outstanding, pending, ebay] = await Promise.all([
    financeTotals(som, now),
    prisma.financeAccount.findMany({ where: { deletedAt: null } }),
    prisma.transaction.groupBy({ by: ["financeAccountId", "type"], where: { deletedAt: null, status: "APPROVED", isEstimated: false, paymentStatus: "PAID", financeAccountId: { not: null } }, _sum: { amount: true } }),
    prisma.$queryRaw<{ m: Date; inc: number; exp: number }[]>`SELECT date_trunc('month', date) m, SUM(CASE WHEN type='INCOME' THEN amount ELSE 0 END)::float inc, SUM(CASE WHEN type='EXPENSE' THEN amount ELSE 0 END)::float exp FROM "Transaction" WHERE "deletedAt" IS NULL AND status='APPROVED' AND "isEstimated"=false AND date >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.transaction.groupBy({ by: ["category"], where: { deletedAt: null, status: "APPROVED", type: "EXPENSE", isEstimated: false, date: { gte: som } }, _sum: { amount: true } }),
    prisma.transaction.findMany({ where: { deletedAt: null, paymentStatus: "OUTSTANDING" }, include: { supplier: true }, orderBy: { dueDate: "asc" }, take: 8 }),
    prisma.transaction.count({ where: { deletedAt: null, status: "PENDING_APPROVAL" } }),
    prisma.transaction.groupBy({ by: ["ebayAccountId", "category"], where: { deletedAt: null, status: "APPROVED", ebayAccountId: { not: null }, date: { gte: som } }, _sum: { amount: true } }),
  ]);
  const ebayAccounts = await prisma.ebayAccount.findMany({ where: { id: { in: [...new Set(ebay.map((e) => e.ebayAccountId!))] } } });
  const bal = (id: string) => { const acc = accounts.find((a) => a.id === id)!; const g = (t: string) => Number(balances.find((b) => b.financeAccountId === id && b.type === t)?._sum.amount ?? 0); return Number(acc.openingBalance) + g("INCOME") - g("EXPENSE"); };
  return (
    <>
      <PageHeader title="Finance Dashboard" subtitle="Confidential – visible to finance and management only." actions={<>
        <Link href="/finance/transactions" className="btn-secondary">Income & expenses</Link>
        {u.can("reports", "view") && <Link href="/reports?tab=pnl" className="btn-secondary">Profit & loss</Link>}
        {u.can("finance", "manage") && <ModalForm trigger="+ Account" title="Add finance account" action={saveFinanceAccount}>
          <Field label="Name"><input name="name" required className="input" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Type"><select name="type" className="input"><option>BANK</option><option>CASH</option><option>PAYOUT</option><option>CARD</option><option>OTHER</option></select></Field><Field label="Currency"><select name="currency" className="input"><option>GBP</option><option>USD</option><option>EUR</option><option>CNY</option></select></Field></div>
          <Field label="Opening balance"><input name="openingBalance" type="number" step="0.01" defaultValue={0} className="input" /></Field>
        </ModalForm>}
      </>} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Income (MTD, actual)" value={fmtMoney(month.income)} tone="green" />
        <Stat label="Expenses (MTD, actual)" value={fmtMoney(month.expense)} tone="red" />
        <Stat label="Actual profit (MTD)" value={fmtMoney(month.profit)} tone={month.profit >= 0 ? "green" : "red"} hint="Realised & approved only" />
        <Stat label="Estimated profit (MTD)" value={fmtMoney(month.estIncome - month.estExpense)} tone="gold" hint="Includes forecasts / estimates" />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Cash flow – last 6 months (actual)" className="xl:col-span-2">
          <AreaTrend data={monthly.map((r) => ({ label: new Date(r.m).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), income: r.inc, expense: r.exp }))} keys={[{ key: "income", label: "Income", color: "#0f766e" }, { key: "expense", label: "Expenses", color: "#b91c1c" }]} />
        </Card>
        <Card title="Expense breakdown (MTD)"><Donut data={cats.map((c) => ({ label: label(c.category), value: Number(c._sum.amount) }))} /></Card>
        <Card title="Available balances" padded={false}>
          <ul className="divide-y">{accounts.map((a) => <li key={a.id} className="flex items-center justify-between px-4 py-3"><span><span className="block text-sm font-medium">{a.name}</span><span className="text-xs text-slate-500">{a.type}</span></span><b className={bal(a.id) < 0 ? "text-red-600" : ""}>{fmtMoney(bal(a.id), a.currency)}</b></li>)}</ul>
          <p className="px-4 pb-3 text-xs text-slate-500">Opening balance + paid, approved, actual transactions linked to the account.</p>
        </Card>
        <Card title="Outstanding payments" padded={false} actions={pending > 0 && <Link href="/finance/transactions?status=PENDING_APPROVAL" className="text-xs font-semibold text-gold-700">{pending} awaiting approval →</Link>}>
          <TableWrap><table className="table"><thead><tr><th>Due</th><th>Description</th><th className="text-right">Amount</th></tr></thead><tbody>
            {outstanding.map((t) => <tr key={t.id}><td className="text-xs">{fmtDate(t.dueDate ?? t.date)}</td><td>{t.description}{t.isEstimated && <Badge tone="gold" className="ml-1">Est.</Badge>}</td><td className="text-right">{fmtMoney(t.amount, t.currency)}</td></tr>)}
          </tbody></table></TableWrap>
        </Card>
        <Card title="eBay account-wise (MTD)" padded={false}>
          <TableWrap><table className="table"><thead><tr><th>Account</th><th className="text-right">Sales</th><th className="text-right">Fees</th><th className="text-right">Refunds</th></tr></thead><tbody>
            {ebayAccounts.map((a) => { const g = (c: string) => Number(ebay.find((e) => e.ebayAccountId === a.id && e.category === c)?._sum.amount ?? 0); return <tr key={a.id}><td>{a.name}</td><td className="text-right">{fmtMoney(g("SALES"))}</td><td className="text-right text-red-600">{fmtMoney(g("PLATFORM_FEE"))}</td><td className="text-right text-red-600">{fmtMoney(g("REFUND"))}</td></tr>; })}
          </tbody></table></TableWrap>
        </Card>
      </div>
    </>
  );
}
