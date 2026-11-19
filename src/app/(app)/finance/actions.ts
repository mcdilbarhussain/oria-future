"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPerm } from "@/lib/auth";
import { CATEGORIES } from "@/lib/finance-constants";
import { run, zs, formToObject, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { notify, notifyPermission } from "@/lib/notify";
import { saveUpload } from "@/lib/storage";

// Expenses above this amount require approval by someone with finance:approve
const APPROVAL_THRESHOLD = 1000;

const txSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]), category: zs.str(40), amount: zs.money().refine((n) => n > 0, "Amount must be > 0"), currency: z.enum(["GBP", "USD", "EUR", "CNY"]),
  date: z.string().transform((s) => new Date(s)), description: zs.str(300), reference: zs.optStr(120), isEstimated: zs.bool(), paymentStatus: z.enum(["PAID", "OUTSTANDING"]), dueDate: zs.optDate(),
  ebayAccountId: zs.optStr(40), supplierId: zs.optStr(40), financeAccountId: zs.optStr(40),
});

export async function saveTransaction(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const id = fd.get("id") ? String(fd.get("id")) : null;
    const u = await assertPerm("finance", id ? "edit" : "create");
    const d = txSchema.parse(formToObject(fd));
    if (!(CATEGORIES[d.type] as readonly string[]).includes(d.category)) throw new UserError("Invalid category for this type.");
    const needsApproval = d.type === "EXPENSE" && d.amount >= APPROVAL_THRESHOLD && !u.can("finance", "approve");
    if (id) {
      const before = await prisma.transaction.findUniqueOrThrow({ where: { id } });
      if (before.status === "APPROVED" && !u.can("finance", "approve") && Number(before.amount) !== d.amount) throw new UserError("Approved amounts can only be changed by a finance approver.");
      await prisma.transaction.update({ where: { id }, data: d });
      await audit({ userId: u.id, module: "finance", action: "update", entity: "Transaction", entityId: id, summary: `edited ${d.type.toLowerCase()} "${d.description}" ${d.amount} ${d.currency}`, before, after: d });
    } else {
      const t = await prisma.transaction.create({ data: { ...d, status: needsApproval ? "PENDING_APPROVAL" : "APPROVED", approvedById: needsApproval ? null : u.id, createdById: u.id } });
      const f = fd.get("file");
      if (f instanceof File && f.size) await saveUpload(f, u.id, "transaction", t.id);
      if (needsApproval) await notifyPermission("finance", "approve", { type: "PAYMENT_APPROVAL", title: `Payment approval required: ${d.amount.toFixed(2)} ${d.currency}`, body: d.description, link: "/finance/transactions?status=PENDING_APPROVAL" }, u.id);
      await audit({ userId: u.id, module: "finance", action: "create", entity: "Transaction", entityId: t.id, summary: `recorded ${d.isEstimated ? "estimated " : ""}${d.type.toLowerCase()} ${d.category} ${d.amount} ${d.currency} – ${d.description}` });
    }
    revalidatePath("/finance/transactions"); revalidatePath("/finance");
    return { ok: true, message: needsApproval ? "Saved – awaiting approval (amount above threshold)." : "Saved." };
  });
}

export async function approveTransaction(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("finance", "approve");
    const id = String(fd.get("id"));
    const status = z.enum(["APPROVED", "REJECTED"]).parse(fd.get("status"));
    const t = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    if (t.createdById === u.id && !u.isSuperAdmin) throw new UserError("You cannot approve your own entry (segregation of duties).");
    await prisma.transaction.update({ where: { id }, data: { status, approvedById: u.id } });
    await notify([t.createdById], { type: "PAYMENT_APPROVAL", title: `Finance entry ${status.toLowerCase()}: ${t.description}`, link: "/finance/transactions" });
    await audit({ userId: u.id, module: "finance", action: status.toLowerCase(), entity: "Transaction", entityId: id, summary: `${status.toLowerCase()} ${t.type.toLowerCase()} ${t.amount} ${t.currency} – ${t.description}` });
    revalidatePath("/finance/transactions");
    return { ok: true };
  });
}

export async function markPaid(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("finance", "edit");
    const id = String(fd.get("id"));
    const actual = fd.get("amount") ? zs.money().parse(fd.get("amount")) : null;
    const t = await prisma.transaction.update({ where: { id }, data: { paymentStatus: "PAID", isEstimated: false, ...(actual ? { amount: actual } : {}), date: new Date() } });
    await audit({ userId: u.id, module: "finance", action: "mark_paid", entity: "Transaction", entityId: id, summary: `marked "${t.description}" as paid (${t.amount} ${t.currency}) – now actual` });
    revalidatePath("/finance/transactions");
    return { ok: true, message: "Marked as paid." };
  });
}

export async function deleteTransaction(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("finance", "delete");
    const t = await prisma.transaction.update({ where: { id: String(fd.get("id")) }, data: { deletedAt: new Date() } });
    await audit({ userId: u.id, module: "finance", action: "delete", entity: "Transaction", entityId: t.id, summary: `voided ${t.type.toLowerCase()} ${t.amount} ${t.currency} – ${t.description}` });
    revalidatePath("/finance/transactions");
    return { ok: true };
  });
}

export async function saveFinanceAccount(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("finance", "manage");
    const d = z.object({ name: zs.str(100), type: z.enum(["BANK", "CASH", "PAYOUT", "CARD", "OTHER"]), currency: z.enum(["GBP", "USD", "EUR", "CNY"]), openingBalance: z.coerce.number(), notes: zs.optStr(500) }).parse(formToObject(fd));
    await prisma.financeAccount.create({ data: d });
    await audit({ userId: u.id, module: "finance", action: "create_account", summary: `added finance account ${d.name}` });
    revalidatePath("/finance");
    return { ok: true };
  });
}

export async function savePayment(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("payroll", "create");
    const d = z.object({ userId: zs.str(), period: z.string().regex(/^\d{4}-\d{2}$/), type: z.enum(["SALARY", "BONUS", "ADVANCE", "REIMBURSEMENT"]), amount: zs.money(), paidAt: zs.optDate(), note: zs.optStr(500), alsoExpense: zs.bool() }).parse(formToObject(fd));
    const { alsoExpense, ...rest } = d;
    await prisma.employeePayment.create({ data: { ...rest, createdById: u.id } });
    if (alsoExpense) await prisma.transaction.create({ data: { type: "EXPENSE", category: "SALARY", amount: d.amount, date: d.paidAt ?? new Date(), description: `Payroll ${d.period} (${d.type.toLowerCase()})`, createdById: u.id, paymentStatus: d.paidAt ? "PAID" : "OUTSTANDING" } });
    await audit({ userId: u.id, module: "payroll", action: "create", summary: `recorded ${d.type.toLowerCase()} payment for period ${d.period}` }); // amount intentionally not logged
    revalidatePath("/finance/payroll");
    return { ok: true, message: "Payment recorded." };
  });
}
