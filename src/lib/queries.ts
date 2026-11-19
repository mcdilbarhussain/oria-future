import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";

export function dayKey(d: Date) { return d.toISOString().slice(0, 10); }

/** Daily sales series for the last N days (optionally scoped to accounts). */
export async function salesSeries(days: number, accountIds?: string[]) {
  const since = new Date(Date.now() - (days - 1) * 86400_000); since.setHours(0, 0, 0, 0);
  const rows = await prisma.$queryRaw<{ day: Date; revenue: number; orders: number }[]>`
    SELECT date_trunc('day', "orderedAt") AS day, SUM(total)::float AS revenue, COUNT(*)::int AS orders
    FROM "EbayOrder" WHERE "orderedAt" >= ${since} ${accountIds ? Prisma.sql`AND "ebayAccountId" IN (${Prisma.join(accountIds.length ? accountIds : ["-"])})` : Prisma.empty}
    GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [dayKey(new Date(r.day)), r]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(since.getTime() + i * 86400_000);
    const r = map.get(dayKey(d));
    return { label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), revenue: Math.round((r?.revenue ?? 0) * 100) / 100, orders: r?.orders ?? 0 };
  });
}

export async function lowStockProducts(limit = 10) {
  return prisma.$queryRaw<{ id: string; sku: string; name: string; qty: number; reorderLevel: number }[]>`
    SELECT p.id, p.sku, p.name, COALESCE(SUM(s.quantity),0)::int AS qty, p."reorderLevel"
    FROM "Product" p LEFT JOIN "StockLevel" s ON s."productId" = p.id
    WHERE p."deletedAt" IS NULL GROUP BY p.id HAVING COALESCE(SUM(s.quantity),0) <= p."reorderLevel"
    ORDER BY qty ASC LIMIT ${limit}`;
}

export async function stockValue() {
  const r = await prisma.$queryRaw<{ units: number; value: number }[]>`
    SELECT COALESCE(SUM(s.quantity),0)::int AS units, COALESCE(SUM(s.quantity * p."costPrice"),0)::float AS value
    FROM "StockLevel" s JOIN "Product" p ON p.id = s."productId" WHERE p."deletedAt" IS NULL`;
  return r[0];
}

export async function financeTotals(from: Date, to: Date) {
  const rows = await prisma.transaction.groupBy({
    by: ["type", "isEstimated"], where: { deletedAt: null, status: "APPROVED", date: { gte: from, lte: to } }, _sum: { amount: true },
  });
  const get = (t: "INCOME" | "EXPENSE", est: boolean) => Number(rows.find((r) => r.type === t && r.isEstimated === est)?._sum.amount ?? 0);
  const income = get("INCOME", false), expense = get("EXPENSE", false);
  return { income, expense, profit: income - expense, estIncome: income + get("INCOME", true), estExpense: expense + get("EXPENSE", true) };
}
