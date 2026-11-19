import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { REPORTS, buildReport, type Report, type ReportParams } from "@/lib/reports";
import { toCSV, toXLSX, toPDF, fileResponse } from "@/lib/export";
import { audit } from "@/lib/audit";
import type { Action, Module } from "@/lib/permissions";
import type { Prisma } from "@prisma/client";

/** Raw data exports (beyond the analytical reports). Each requires the module's export permission. */
const DATASETS: Record<string, { perm: [Module, Action]; build: (p: ReportParams, sp: URLSearchParams, u: CurrentUser) => Promise<Report> }> = {
  audit: { perm: ["activity_logs", "view"], build: async (p, sp) => {
    const rows = await prisma.auditLog.findMany({ where: { createdAt: { gte: p.from, lte: p.to }, ...(sp.get("user") ? { userId: sp.get("user")! } : {}), ...(sp.get("module") ? { module: sp.get("module")! } : {}) }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 50000 });
    return { title: "Activity log", columns: [{ key: "at", label: "When", type: "text" }, { key: "user", label: "User" }, { key: "module", label: "Module" }, { key: "action", label: "Action" }, { key: "summary", label: "Summary" }, { key: "ip", label: "IP" }], rows: rows.map((r) => ({ at: r.createdAt.toISOString(), user: r.user?.name ?? "System", module: r.module, action: r.action, summary: r.summary, ip: r.ip })) };
  } },
  transactions: { perm: ["finance", "export"], build: async (p, sp) => {
    const where: Prisma.TransactionWhereInput = { deletedAt: null, date: { gte: p.from, lte: p.to }, ...(sp.get("type") ? { type: sp.get("type") as "INCOME" } : {}), ...(sp.get("category") ? { category: sp.get("category")! } : {}), ...(sp.get("account") ? { ebayAccountId: sp.get("account")! } : {}), ...(sp.get("basis") === "actual" ? { isEstimated: false } : sp.get("basis") === "estimated" ? { isEstimated: true } : {}) };
    const rows = await prisma.transaction.findMany({ where, include: { ebayAccount: true, supplier: true }, orderBy: { date: "desc" } });
    return { title: "Income & expenses", columns: [{ key: "date", label: "Date", type: "date" }, { key: "type", label: "Type" }, { key: "category", label: "Category" }, { key: "description", label: "Description" }, { key: "reference", label: "Reference" }, { key: "account", label: "eBay account" }, { key: "supplier", label: "Supplier" }, { key: "currency", label: "Ccy" }, { key: "amount", label: "Amount", type: "money" }, { key: "basis", label: "Basis" }, { key: "payment", label: "Payment" }, { key: "status", label: "Approval" }], rows: rows.map((t) => ({ date: t.date, type: t.type, category: t.category, description: t.description, reference: t.reference, account: t.ebayAccount?.name, supplier: t.supplier?.companyName, currency: t.currency, amount: Number(t.amount), basis: t.isEstimated ? "Estimated" : "Actual", payment: t.paymentStatus, status: t.status })) };
  } },
  orders: { perm: ["ebay_orders", "export"], build: async (p, sp, u) => {
    const scope = u.isSuperAdmin || u.can("ebay_accounts", "manage") ? undefined : u.assignedEbayAccountIds;
    const acc = sp.get("account");
    const rows = await prisma.ebayOrder.findMany({ where: { orderedAt: { gte: p.from, lte: p.to }, ebayAccountId: acc ? (scope && !scope.includes(acc) ? "-" : acc) : scope ? { in: scope } : undefined, ...(sp.get("status") === "awaiting" ? { dispatchedAt: null } : {}) }, include: { ebayAccount: true, items: true }, orderBy: { orderedAt: "desc" } });
    return { title: "eBay orders", columns: [{ key: "date", label: "Date", type: "date" }, { key: "account", label: "Account" }, { key: "orderId", label: "Order" }, { key: "buyer", label: "Buyer" }, { key: "items", label: "Items" }, { key: "total", label: "Total", type: "money" }, { key: "fees", label: "Fees", type: "money" }, { key: "refunded", label: "Refunded", type: "money" }, { key: "payment", label: "Payment" }, { key: "dispatched", label: "Dispatched", type: "date" }, { key: "tracking", label: "Tracking" }], rows: rows.map((o) => ({ date: o.orderedAt, account: o.ebayAccount.name, orderId: o.orderId, buyer: o.buyerUsername, items: o.items.map((i) => `${i.quantity}x ${i.sku ?? i.title}`).join("; "), total: Number(o.total), fees: Number(o.fees ?? 0), refunded: Number(o.refundedAmount), payment: o.paymentStatus, dispatched: o.dispatchedAt, tracking: o.trackingNumber })) };
  } },
  listings: { perm: ["ebay_listings", "export"], build: async (_p, _sp, u) => {
    const scope = u.isSuperAdmin || u.can("ebay_accounts", "manage") ? undefined : u.assignedEbayAccountIds;
    const rows = await prisma.ebayListing.findMany({ where: { deletedAt: null, ...(scope ? { ebayAccountId: { in: scope } } : {}) }, include: { ebayAccount: true } });
    return { title: "eBay listings", columns: [{ key: "account", label: "Account" }, { key: "sku", label: "SKU" }, { key: "title", label: "Title" }, { key: "itemId", label: "Item ID" }, { key: "price", label: "Price", type: "money" }, { key: "qty", label: "Qty", type: "number" }, { key: "sold", label: "Sold", type: "number" }, { key: "status", label: "Status" }], rows: rows.map((l) => ({ account: l.ebayAccount.name, sku: l.sku, title: l.title, itemId: l.ebayItemId, price: Number(l.price), qty: l.quantity, sold: l.soldQuantity, status: l.status })) };
  } },
  movements: { perm: ["warehouse", "export"], build: async (p) => {
    const rows = await prisma.stockMovement.findMany({ where: { createdAt: { gte: p.from, lte: p.to } }, include: { product: true, warehouse: true, user: true }, orderBy: { createdAt: "desc" } });
    return { title: "Stock movements", columns: [{ key: "date", label: "Date", type: "date" }, { key: "sku", label: "SKU" }, { key: "type", label: "Type" }, { key: "wh", label: "Location" }, { key: "qty", label: "Qty", type: "number" }, { key: "bal", label: "Balance", type: "number" }, { key: "ref", label: "Reference" }, { key: "user", label: "By" }], rows: rows.map((m) => ({ date: m.createdAt, sku: m.product.sku, type: m.type, wh: m.warehouse.code, qty: m.quantity, bal: m.balanceAfter, ref: m.reference, user: m.user?.name ?? "System" })) };
  } },
  payroll: { perm: ["payroll", "export"], build: async (_p, sp) => {
    const rows = await prisma.employeePayment.findMany({ where: { deletedAt: null, ...(sp.get("period") ? { period: sp.get("period")! } : {}) }, include: { user: true }, orderBy: { period: "desc" } });
    return { title: "Employee payments (CONFIDENTIAL)", columns: [{ key: "period", label: "Period" }, { key: "name", label: "Employee" }, { key: "type", label: "Type" }, { key: "amount", label: "Amount", type: "money" }, { key: "paid", label: "Paid", type: "date" }], rows: rows.map((r) => ({ period: r.period, name: r.user.name, type: r.type, amount: Number(r.amount), paid: r.paidAt })) };
  } },
};

export async function GET(req: Request, { params }: { params: Promise<{ report: string }> }) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { report } = await params;
  const sp = new URL(req.url).searchParams;
  const format = sp.get("format") ?? "csv";
  const p: ReportParams = { from: sp.get("from") ? new Date(sp.get("from")!) : new Date(Date.now() - 365 * 86400_000), to: sp.get("to") ? new Date(sp.get("to") + "T23:59:59") : new Date(), account: sp.get("account") || undefined, q: sp.get("q") || undefined };
  let r: Report;
  const ds = DATASETS[report];
  const def = REPORTS[report === "stock" || report === "purchases" ? report : report];
  if (ds) {
    if (!u.can(...ds.perm) && !(report === "audit" && u.isSuperAdmin)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    r = await ds.build(p, sp, u);
  } else if (def) {
    if (!u.can(...def.perm) || !(u.can("reports", "export") || u.can(def.perm[0], "export"))) return NextResponse.json({ error: "Forbidden – export permission required" }, { status: 403 });
    r = await buildReport(report, p, u);
  } else return NextResponse.json({ error: "Unknown report" }, { status: 404 });
  await audit({ userId: u.id, module: "reports", action: "export", summary: `exported ${r.title} (${format.toUpperCase()}, ${r.rows.length} rows)` });
  const name = `oria-${report}-${new Date().toISOString().slice(0, 10)}`;
  if (format === "xlsx") return fileResponse(await toXLSX(r), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  if (format === "pdf") return fileResponse(await toPDF(r), `${name}.pdf`, "application/pdf");
  return fileResponse(toCSV(r), `${name}.csv`, "text/csv; charset=utf-8");
}
