import Link from "next/link";
import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma, TxStatus, TxType } from "@prisma/client";
import { PageHeader, Card, FilterBar, TableWrap, StatusBadge, Badge, DemoBadge, Pagination, Stat } from "@/components/ui";
import { ActionButton, ModalForm } from "@/components/forms";
import { fmtMoney, fmtDate, label } from "@/lib/format";
import { CATEGORIES } from "@/lib/finance-constants";
import { saveTransaction, approveTransaction, markPaid, deleteTransaction } from "../actions";
import { TxFields } from "../fields";

export const metadata = { title: "Income & Expenses" };
const PER = 50;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await requirePage("finance");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page || 1));
  const where: Prisma.TransactionWhereInput = {
    deletedAt: null,
    ...(sp.type ? { type: sp.type as TxType } : {}), ...(sp.category ? { category: sp.category } : {}), ...(sp.status ? { status: sp.status as TxStatus } : {}),
    ...(sp.account ? { ebayAccountId: sp.account } : {}), ...(sp.payment ? { paymentStatus: sp.payment } : {}), ...(sp.basis === "actual" ? { isEstimated: false } : sp.basis === "estimated" ? { isEstimated: true } : {}),
    ...(sp.q ? { OR: [{ description: { contains: sp.q, mode: "insensitive" } }, { reference: { contains: sp.q, mode: "insensitive" } }] } : {}),
    date: { ...(sp.from ? { gte: new Date(sp.from) } : {}), ...(sp.to ? { lte: new Date(sp.to + "T23:59:59") } : {}) },
  };
  const [rows, total, sums, accounts, suppliers, financeAccounts] = await Promise.all([
    prisma.transaction.findMany({ where, include: { ebayAccount: true, supplier: true }, orderBy: { date: "desc" }, skip: (page - 1) * PER, take: PER }),
    prisma.transaction.count({ where }),
    prisma.transaction.groupBy({ by: ["type"], where: { ...where, status: "APPROVED" }, _sum: { amount: true } }),
    prisma.ebayAccount.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, companyName: true } }),
    prisma.financeAccount.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
  ]);
  const inc = Number(sums.find((s) => s.type === "INCOME")?._sum.amount ?? 0), exp = Number(sums.find((s) => s.type === "EXPENSE")?._sum.amount ?? 0);
  const qs = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "page") as [string, string][]);
  return (
    <>
      <PageHeader title="Income & Expenses" subtitle="Supplier payments, shipping, warehouse costs, eBay sales, fees and refunds" actions={<>
        {u.can("finance", "export") && <><a className="btn-secondary" href={`/api/export/transactions?format=xlsx&${qs}`}>Excel</a><a className="btn-secondary" href={`/api/export/transactions?format=csv&${qs}`}>CSV</a></>}
        {u.can("finance", "create") && <ModalForm trigger="+ Record transaction" title="Record income / expense" action={saveTransaction} wide><TxFields accounts={accounts} suppliers={suppliers.map((s) => ({ id: s.id, name: s.companyName }))} financeAccounts={financeAccounts} /></ModalForm>}
      </>} />
      <div className="mb-6 grid grid-cols-3 gap-4"><Stat label="Income (filtered, approved)" value={fmtMoney(inc)} tone="green" /><Stat label="Expenses (filtered, approved)" value={fmtMoney(exp)} tone="red" /><Stat label="Net" value={fmtMoney(inc - exp)} tone={inc - exp >= 0 ? "green" : "red"} /></div>
      <FilterBar>
        <input name="q" defaultValue={sp.q} placeholder="Description / ref" className="input w-44" />
        <select name="type" defaultValue={sp.type} className="input w-32"><option value="">All types</option><option>INCOME</option><option>EXPENSE</option></select>
        <select name="category" defaultValue={sp.category} className="input w-44"><option value="">All categories</option>{[...CATEGORIES.INCOME, ...CATEGORIES.EXPENSE].map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
        <select name="account" defaultValue={sp.account} className="input w-44"><option value="">All eBay accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select name="status" defaultValue={sp.status} className="input w-40"><option value="">Any approval</option><option value="APPROVED">Approved</option><option value="PENDING_APPROVAL">Pending approval</option><option value="REJECTED">Rejected</option></select>
        <select name="basis" defaultValue={sp.basis} className="input w-36"><option value="">Actual + est.</option><option value="actual">Actual only</option><option value="estimated">Estimated only</option></select>
        <select name="payment" defaultValue={sp.payment} className="input w-36"><option value="">Paid + due</option><option value="PAID">Paid</option><option value="OUTSTANDING">Outstanding</option></select>
        <input type="date" name="from" defaultValue={sp.from} className="input w-36" /><input type="date" name="to" defaultValue={sp.to} className="input w-36" />
      </FilterBar>
      <Card padded={false}>
        <TableWrap><table className="table"><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Linked</th><th className="text-right">Amount</th><th>Basis</th><th>Payment</th><th>Approval</th><th></th></tr></thead><tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap text-xs">{fmtDate(t.date)}</td>
              <td className="max-w-xs">{t.description} <DemoBadge show={t.isDemo} />{t.reference && <span className="block text-xs text-slate-500">{t.reference}</span>}</td>
              <td><Badge tone={t.type === "INCOME" ? "green" : "slate"}>{label(t.category)}</Badge></td>
              <td className="text-xs">{t.ebayAccount?.name ?? (t.supplier ? <Link className="link" href={`/suppliers/${t.supplier.id}`}>{t.supplier.companyName}</Link> : "—")}</td>
              <td className={`whitespace-nowrap text-right font-semibold ${t.type === "INCOME" ? "text-emerald-700" : "text-red-700"}`}>{t.type === "INCOME" ? "+" : "−"}{fmtMoney(t.amount, t.currency)}</td>
              <td>{t.isEstimated ? <Badge tone="gold">Estimated</Badge> : <Badge tone="navy">Actual</Badge>}</td>
              <td><StatusBadge status={t.paymentStatus} /></td>
              <td><StatusBadge status={t.status} /></td>
              <td className="whitespace-nowrap">
                {t.status === "PENDING_APPROVAL" && u.can("finance", "approve") && <><ActionButton action={approveTransaction} fields={{ id: t.id, status: "APPROVED" }} className="btn-primary btn-sm">Approve</ActionButton> <ActionButton action={approveTransaction} fields={{ id: t.id, status: "REJECTED" }} className="btn-ghost btn-sm text-red-600">Reject</ActionButton></>}
                {t.paymentStatus === "OUTSTANDING" && u.can("finance", "edit") && <ActionButton action={markPaid} fields={{ id: t.id }} confirm="Mark as paid? Estimated entries become actual.">Mark paid</ActionButton>}
                {u.can("finance", "delete") && <ActionButton action={deleteTransaction} fields={{ id: t.id }} className="btn-ghost btn-sm text-slate-400" confirm="Void this entry? (soft delete, kept in audit trail)">Void</ActionButton>}
              </td>
            </tr>
          ))}
        </tbody></table></TableWrap>
        <Pagination page={page} pages={Math.ceil(total / PER)} params={sp} />
      </Card>
    </>
  );
}
