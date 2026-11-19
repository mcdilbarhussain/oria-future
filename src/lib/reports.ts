import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";
import type { Action, Module } from "./permissions";
import { profitAndLoss } from "./workflows/finance";

export type Col = { key: string; label: string; type?: "money" | "number" | "date" | "text" | "percent" };
export type Report = { title: string; columns: Col[]; rows: Record<string, unknown>[]; summary?: [string, string | number][]; chart?: { x: string; y: string[]; kind: "bar" | "area" } };
export type ReportParams = { from: Date; to: Date; account?: string; period?: string; q?: string; status?: string; user?: string; module?: string; basis?: string; type?: string; category?: string; payment?: string };

export const REPORTS: Record<string, { label: string; perm: [Module, Action]; group: string }> = {
  sales: { label: "Total sales (daily)", perm: ["reports", "view"], group: "Sales" },
  monthly: { label: "Monthly orders & revenue", perm: ["reports", "view"], group: "Sales" },
  accounts: { label: "Account-wise sales", perm: ["reports", "view"], group: "Sales" },
  products: { label: "Product-wise sales", perm: ["reports", "view"], group: "Sales" },
  returns: { label: "Returns & refunds", perm: ["reports", "view"], group: "Sales" },
  stock: { label: "Stock report", perm: ["inventory", "view"], group: "Inventory" },
  lowstock: { label: "Low-stock report", perm: ["inventory", "view"], group: "Inventory" },
  purchases: { label: "Purchase report", perm: ["purchasing", "view"], group: "Procurement" },
  suppliers: { label: "Supplier report", perm: ["suppliers", "view"], group: "Procurement" },
  expenses: { label: "Expenses by category", perm: ["finance", "view"], group: "Finance" },
  revenue: { label: "Revenue by source", perm: ["finance", "view"], group: "Finance" },
  pnl: { label: "Profit & loss (actual vs estimated)", perm: ["finance", "view"], group: "Finance" },
  cashflow: { label: "Cash flow (monthly)", perm: ["finance", "view"], group: "Finance" },
  employees: { label: "Employee performance", perm: ["employees", "view"], group: "Team" },
  tasks: { label: "Task completion", perm: ["tasks", "view"], group: "Team" },
};

const n = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

export async function buildReport(name: string, p: ReportParams, u: CurrentUser): Promise<Report> {
  const scopeIds = u.isSuperAdmin || u.can("ebay_accounts", "manage") ? null : u.assignedEbayAccountIds;
  const accIds = p.account ? (scopeIds && !scopeIds.includes(p.account) ? ["-"] : [p.account]) : scopeIds;
  const accSql = accIds ? Prisma.sql`AND o."ebayAccountId" IN (${Prisma.join(accIds.length ? accIds : ["-"])})` : Prisma.empty;
  const { from, to } = p;

  switch (name) {
    case "sales": {
      const agg = await prisma.$queryRaw<{ day: Date; orders: number; revenue: number; fees: number; refunds: number }[]>`
        SELECT date_trunc('day', o."orderedAt") AS day, COUNT(*)::int orders, SUM(o.total)::float revenue, COALESCE(SUM(o.fees),0)::float fees, SUM(o."refundedAmount")::float refunds
        FROM "EbayOrder" o WHERE o."orderedAt" BETWEEN ${from} AND ${to} ${accSql} GROUP BY 1 ORDER BY 1`;
      const units = await prisma.$queryRaw<{ day: Date; units: number }[]>`
        SELECT date_trunc('day', o."orderedAt") AS day, SUM(i.quantity)::int units FROM "EbayOrderItem" i JOIN "EbayOrder" o ON o.id = i."orderId" WHERE o."orderedAt" BETWEEN ${from} AND ${to} ${accSql} GROUP BY 1`;
      const out = agg.map((a) => ({ date: a.day, orders: a.orders, units: units.find((x) => +x.day === +a.day)?.units ?? 0, revenue: n(a.revenue), fees: n(a.fees), refunds: n(a.refunds), net: n(a.revenue - a.fees - a.refunds) }));
      const tot = (k: string) => n(out.reduce((s, r) => s + Number((r as Record<string, unknown>)[k]), 0));
      return { title: "Total sales", columns: [{ key: "date", label: "Date", type: "date" }, { key: "orders", label: "Orders", type: "number" }, { key: "units", label: "Units", type: "number" }, { key: "revenue", label: "Revenue", type: "money" }, { key: "fees", label: "eBay fees", type: "money" }, { key: "refunds", label: "Refunds", type: "money" }, { key: "net", label: "Net sales", type: "money" }], rows: out, summary: [["Orders", tot("orders")], ["Revenue", tot("revenue")], ["Fees", tot("fees")], ["Refunds", tot("refunds")], ["Net", tot("net")]], chart: { x: "date", y: ["revenue"], kind: "area" } };
    }
    case "monthly": {
      const rows = await prisma.$queryRaw<{ m: Date; orders: number; revenue: number; avg: number }[]>`SELECT date_trunc('month', o."orderedAt") m, COUNT(*)::int orders, SUM(o.total)::float revenue, AVG(o.total)::float avg FROM "EbayOrder" o WHERE o."orderedAt" BETWEEN ${from} AND ${to} ${accSql} GROUP BY 1 ORDER BY 1`;
      return { title: "Monthly orders", columns: [{ key: "month", label: "Month" }, { key: "orders", label: "Orders", type: "number" }, { key: "revenue", label: "Revenue", type: "money" }, { key: "avg", label: "Avg order value", type: "money" }], rows: rows.map((r) => ({ month: new Date(r.m).toLocaleDateString("en-GB", { month: "long", year: "numeric" }), orders: r.orders, revenue: n(r.revenue), avg: n(r.avg) })), chart: { x: "month", y: ["revenue"], kind: "bar" } };
    }
    case "accounts": {
      const rows = await prisma.$queryRaw<{ name: string; orders: number; revenue: number; fees: number; refunds: number }[]>`SELECT a.name, COUNT(o.id)::int orders, COALESCE(SUM(o.total),0)::float revenue, COALESCE(SUM(o.fees),0)::float fees, COALESCE(SUM(o."refundedAmount"),0)::float refunds FROM "EbayOrder" o JOIN "EbayAccount" a ON a.id=o."ebayAccountId" WHERE o."orderedAt" BETWEEN ${from} AND ${to} ${accSql} GROUP BY a.name ORDER BY revenue DESC`;
      return { title: "Account-wise sales", columns: [{ key: "name", label: "eBay account" }, { key: "orders", label: "Orders", type: "number" }, { key: "revenue", label: "Revenue", type: "money" }, { key: "fees", label: "Fees", type: "money" }, { key: "refunds", label: "Refunds", type: "money" }, { key: "net", label: "Net", type: "money" }], rows: rows.map((r) => ({ ...r, revenue: n(r.revenue), fees: n(r.fees), refunds: n(r.refunds), net: n(r.revenue - r.fees - r.refunds) })), chart: { x: "name", y: ["revenue"], kind: "bar" } };
    }
    case "products": {
      const rows = await prisma.$queryRaw<{ sku: string; title: string; units: number; revenue: number; cost: number }[]>`SELECT COALESCE(i.sku,'(no SKU)') sku, MAX(i.title) title, SUM(i.quantity)::int units, SUM(i.quantity*i."unitPrice")::float revenue, COALESCE(SUM(i.quantity*p."costPrice"),0)::float cost FROM "EbayOrderItem" i JOIN "EbayOrder" o ON o.id=i."orderId" LEFT JOIN "Product" p ON p.id=i."productId" WHERE o."orderedAt" BETWEEN ${from} AND ${to} ${accSql} GROUP BY 1 ORDER BY revenue DESC`;
      return { title: "Product-wise sales", columns: [{ key: "sku", label: "SKU" }, { key: "title", label: "Product" }, { key: "units", label: "Units", type: "number" }, { key: "revenue", label: "Revenue", type: "money" }, { key: "cost", label: "Product cost (est.)", type: "money" }, { key: "margin", label: "Gross margin (est.)", type: "money" }], rows: rows.map((r) => ({ ...r, revenue: n(r.revenue), cost: n(r.cost), margin: n(r.revenue - r.cost) })), chart: { x: "sku", y: ["revenue"], kind: "bar" } };
    }
    case "returns": {
      const rows = await prisma.ebayReturn.findMany({ where: { openedAt: { gte: from, lte: to }, ...(accIds ? { ebayAccountId: { in: accIds } } : {}) }, include: { ebayAccount: true }, orderBy: { openedAt: "desc" } });
      return { title: "Returns & refunds", columns: [{ key: "openedAt", label: "Opened", type: "date" }, { key: "account", label: "Account" }, { key: "returnId", label: "Return" }, { key: "orderId", label: "Order" }, { key: "buyer", label: "Buyer" }, { key: "reason", label: "Reason" }, { key: "status", label: "Status" }, { key: "refund", label: "Refund", type: "money" }], rows: rows.map((r) => ({ openedAt: r.openedAt, account: r.ebayAccount.name, returnId: r.returnId, orderId: r.orderId, buyer: r.buyerUsername, reason: r.reason, status: r.status, refund: n(r.refundAmount) })), summary: [["Returns", rows.length], ["Refunded", n(rows.reduce((s, r) => s + Number(r.refundAmount ?? 0), 0))]] };
    }
    case "stock":
    case "lowstock": {
      const rows = await prisma.$queryRaw<{ sku: string; name: string; category: string | null; barcode: string | null; qty: number; reorderLevel: number; cost: number; price: number }[]>`SELECT p.sku, p.name, p.category, p.barcode, COALESCE(SUM(s.quantity),0)::int qty, p."reorderLevel", p."costPrice"::float cost, p."sellPrice"::float price FROM "Product" p LEFT JOIN "StockLevel" s ON s."productId"=p.id WHERE p."deletedAt" IS NULL GROUP BY p.id ORDER BY p.sku`;
      const data = (name === "lowstock" ? rows.filter((r) => r.qty <= r.reorderLevel) : rows).filter((r) => !p.q || r.sku.toLowerCase().includes(p.q.toLowerCase()) || r.name.toLowerCase().includes(p.q.toLowerCase()));
      return { title: name === "lowstock" ? "Low-stock report" : "Stock report", columns: [{ key: "sku", label: "SKU" }, { key: "name", label: "Product" }, { key: "category", label: "Category" }, { key: "barcode", label: "Barcode" }, { key: "qty", label: "Qty", type: "number" }, { key: "reorderLevel", label: "Reorder level", type: "number" }, { key: "cost", label: "Unit cost", type: "money" }, { key: "value", label: "Stock value", type: "money" }], rows: data.map((r) => ({ ...r, value: n(r.qty * r.cost) })), summary: [["SKUs", data.length], ["Units", data.reduce((s, r) => s + r.qty, 0)], ["Value", n(data.reduce((s, r) => s + r.qty * r.cost, 0))]] };
    }
    case "purchases": {
      const rows = await prisma.purchaseOrder.findMany({ where: { deletedAt: null, createdAt: { gte: from, lte: to } }, include: { supplier: true, items: { include: { product: true } }, purchaseRequest: true }, orderBy: { createdAt: "desc" } });
      return { title: "Purchase report", columns: [{ key: "date", label: "Created", type: "date" }, { key: "po", label: "PO" }, { key: "pr", label: "Request" }, { key: "supplier", label: "Supplier" }, { key: "items", label: "Items" }, { key: "currency", label: "Ccy" }, { key: "total", label: "Total", type: "money" }, { key: "status", label: "Status" }, { key: "received", label: "Received", type: "date" }], rows: rows.map((r) => ({ date: r.createdAt, po: r.poNumber, pr: r.purchaseRequest?.reference ?? "", supplier: r.supplier.companyName, items: r.items.map((i) => `${i.product.sku}×${i.quantity}`).join(", "), currency: r.currency, total: n(r.total), status: r.status, received: r.receivedAt })) };
    }
    case "suppliers": {
      const rows = await prisma.supplier.findMany({ where: { deletedAt: null }, include: { _count: { select: { quotations: true, products: true } }, purchaseOrders: { where: { deletedAt: null, createdAt: { gte: from, lte: to } } } } });
      return { title: "Supplier report", columns: [{ key: "name", label: "Supplier" }, { key: "city", label: "City" }, { key: "rating", label: "Rating", type: "number" }, { key: "products", label: "Catalogue items", type: "number" }, { key: "quotes", label: "Quotations", type: "number" }, { key: "pos", label: "POs (period)", type: "number" }, { key: "spend", label: "PO value (period)", type: "money" }, { key: "onTime", label: "Received POs", type: "number" }], rows: rows.map((s) => ({ name: s.companyName, city: s.city, rating: Number(s.rating ?? 0), products: s._count.products, quotes: s._count.quotations, pos: s.purchaseOrders.length, spend: n(s.purchaseOrders.reduce((a, b) => a + Number(b.total), 0)), onTime: s.purchaseOrders.filter((po) => po.status === "RECEIVED").length })) };
    }
    case "expenses":
    case "revenue": {
      const type = name === "expenses" ? "EXPENSE" : "INCOME";
      const rows = await prisma.transaction.groupBy({ by: ["category", "isEstimated"], where: { deletedAt: null, status: "APPROVED", type, date: { gte: from, lte: to }, ...(p.account ? { ebayAccountId: p.account } : {}) }, _sum: { amount: true }, _count: true });
      const cats = [...new Set(rows.map((r) => r.category))];
      const data = cats.map((c) => { const a = rows.find((r) => r.category === c && !r.isEstimated), e = rows.find((r) => r.category === c && r.isEstimated); return { category: c, count: (a?._count ?? 0) + (e?._count ?? 0), actual: n(a?._sum.amount), estimated: n(e?._sum.amount), total: n(Number(a?._sum.amount ?? 0) + Number(e?._sum.amount ?? 0)) }; }).sort((a, b) => b.total - a.total);
      return { title: name === "expenses" ? "Expenses by category" : "Revenue by source", columns: [{ key: "category", label: "Category" }, { key: "count", label: "Entries", type: "number" }, { key: "actual", label: "Actual", type: "money" }, { key: "estimated", label: "Estimated", type: "money" }, { key: "total", label: "Total", type: "money" }], rows: data, chart: { x: "category", y: ["actual", "estimated"], kind: "bar" }, summary: [["Actual", n(data.reduce((s, r) => s + r.actual, 0))], ["Estimated", n(data.reduce((s, r) => s + r.estimated, 0))]] };
    }
    case "pnl": {
      const txs = await prisma.transaction.findMany({ where: { deletedAt: null, date: { gte: from, lte: to }, ...(p.account ? { ebayAccountId: p.account } : {}) }, select: { type: true, category: true, amount: true, isEstimated: true, status: true } });
      const r = profitAndLoss(txs.map((t) => ({ ...t, amount: Number(t.amount) })));
      const rows = Object.entries(r.byCategory).sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount }));
      rows.push({ category: "— ACTUAL NET PROFIT —", amount: r.actual.profit });
      return { title: "Profit & loss", columns: [{ key: "category", label: "Line (actual, approved)" }, { key: "amount", label: "Amount", type: "money" }], rows, summary: [["Actual income", r.actual.income], ["Actual expenses", r.actual.expense], ["ACTUAL PROFIT", r.actual.profit], ["Estimated income", r.estimated.income], ["Estimated expenses", r.estimated.expense], ["ESTIMATED PROFIT", r.estimated.profit]] };
    }
    case "cashflow": {
      const rows = await prisma.$queryRaw<{ m: Date; inc: number; exp: number }[]>`SELECT date_trunc('month', date) m, SUM(CASE WHEN type='INCOME' THEN amount ELSE 0 END)::float inc, SUM(CASE WHEN type='EXPENSE' THEN amount ELSE 0 END)::float exp FROM "Transaction" WHERE "deletedAt" IS NULL AND status='APPROVED' AND "isEstimated"=false AND "paymentStatus"='PAID' AND date BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 1`;
      let running = 0;
      return { title: "Cash flow (actual, paid)", columns: [{ key: "month", label: "Month" }, { key: "inflow", label: "Inflow", type: "money" }, { key: "outflow", label: "Outflow", type: "money" }, { key: "net", label: "Net", type: "money" }, { key: "cumulative", label: "Cumulative", type: "money" }], rows: rows.map((r) => { running += r.inc - r.exp; return { month: new Date(r.m).toLocaleDateString("en-GB", { month: "short", year: "numeric" }), inflow: n(r.inc), outflow: n(r.exp), net: n(r.inc - r.exp), cumulative: n(running) }; }), chart: { x: "month", y: ["inflow", "outflow"], kind: "bar" } };
    }
    case "employees": {
      const users = await prisma.user.findMany({ where: { deletedAt: null }, include: { role: true, department: true } });
      const tasks = await prisma.task.findMany({ where: { deletedAt: null, assigneeId: { not: null }, createdAt: { lte: to }, OR: [{ completedAt: { gte: from } }, { completedAt: null }] }, select: { assigneeId: true, status: true, dueDate: true, completedAt: true } });
      const logs = await prisma.auditLog.groupBy({ by: ["userId"], where: { createdAt: { gte: from, lte: to } }, _count: true });
      const listings = await prisma.ebayListing.groupBy({ by: ["createdById"], where: { createdAt: { gte: from, lte: to } }, _count: true });
      const replies = await prisma.buyerMessage.groupBy({ by: ["authorId"], where: { direction: "OUTBOUND", status: "SENT", createdAt: { gte: from, lte: to } }, _count: true });
      return {
        title: "Employee performance", columns: [{ key: "name", label: "Employee" }, { key: "dept", label: "Department" }, { key: "assigned", label: "Tasks", type: "number" }, { key: "completed", label: "Completed", type: "number" }, { key: "onTime", label: "On time %", type: "percent" }, { key: "overdue", label: "Overdue", type: "number" }, { key: "listings", label: "Listings created", type: "number" }, { key: "replies", label: "Buyer replies", type: "number" }, { key: "actions", label: "Logged actions", type: "number" }],
        rows: users.map((x) => { const t = tasks.filter((k) => k.assigneeId === x.id); const done = t.filter((k) => k.status === "COMPLETED"); const ontime = done.filter((k) => !k.dueDate || (k.completedAt && k.completedAt <= k.dueDate)); return { name: x.name, dept: x.department?.name ?? "", assigned: t.length, completed: done.length, onTime: done.length ? Math.round((ontime.length / done.length) * 100) : 0, overdue: t.filter((k) => k.status === "OVERDUE").length, listings: listings.find((l) => l.createdById === x.id)?._count ?? 0, replies: replies.find((l) => l.authorId === x.id)?._count ?? 0, actions: logs.find((l) => l.userId === x.id)?._count ?? 0 }; }).sort((a, b) => b.completed - a.completed),
      };
    }
    case "tasks": {
      const rows = await prisma.task.groupBy({ by: ["departmentId", "status"], where: { deletedAt: null, createdAt: { gte: from, lte: to } }, _count: true });
      const deps = await prisma.department.findMany();
      const ids = [...new Set(rows.map((r) => r.departmentId))];
      const c = (d: string | null, s: string) => rows.find((r) => r.departmentId === d && r.status === s)?._count ?? 0;
      return { title: "Task completion", columns: [{ key: "dept", label: "Department" }, { key: "total", label: "Total", type: "number" }, { key: "completed", label: "Completed", type: "number" }, { key: "open", label: "Open", type: "number" }, { key: "waiting", label: "Awaiting approval", type: "number" }, { key: "overdue", label: "Overdue", type: "number" }, { key: "rate", label: "Completion %", type: "percent" }], rows: ids.map((d) => { const total = rows.filter((r) => r.departmentId === d).reduce((s, r) => s + r._count, 0); return { dept: deps.find((x) => x.id === d)?.name ?? "Unassigned", total, completed: c(d, "COMPLETED"), open: c(d, "NEW") + c(d, "ASSIGNED") + c(d, "IN_PROGRESS"), waiting: c(d, "WAITING_APPROVAL"), overdue: c(d, "OVERDUE"), rate: total ? Math.round((c(d, "COMPLETED") / total) * 100) : 0 }; }), chart: { x: "dept", y: ["completed", "open", "overdue"], kind: "bar" } };
    }
  }
  throw new Error("Unknown report");
}
