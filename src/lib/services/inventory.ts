import "server-only";
import type { MovementType, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { UserError } from "../action";
import { notifyPermission } from "../notify";

type Tx = Prisma.TransactionClient;

export async function defaultWarehouseId(tx: Tx | typeof prisma = prisma) {
  const w = (await tx.warehouse.findFirst({ where: { isDefault: true, deletedAt: null } })) ?? (await tx.warehouse.findFirst({ where: { deletedAt: null } }));
  if (!w) throw new UserError("No warehouse configured. Create a warehouse first.");
  return w.id;
}

/**
 * Atomically applies a signed stock change and records it in the movement history.
 * Must be called inside a transaction. Rejects changes that would make stock negative.
 */
export async function applyMovement(tx: Tx, m: { productId: string; warehouseId: string; type: MovementType; quantity: number; reference?: string | null; note?: string | null; userId?: string | null; allowNegative?: boolean }) {
  if (!Number.isInteger(m.quantity) || m.quantity === 0) throw new UserError("Quantity must be a non-zero whole number.");
  const level = await tx.stockLevel.upsert({
    where: { productId_warehouseId: { productId: m.productId, warehouseId: m.warehouseId } },
    create: { productId: m.productId, warehouseId: m.warehouseId, quantity: 0 },
    update: {},
  });
  // Row-level lock to serialise concurrent movements on the same stock line.
  const [{ quantity: current }] = await tx.$queryRaw<{ quantity: number }[]>`SELECT quantity FROM "StockLevel" WHERE id = ${level.id} FOR UPDATE`;
  const next = current + m.quantity;
  if (next < 0 && !m.allowNegative) throw new UserError(`Insufficient stock: ${current} available, ${-m.quantity} requested.`);
  await tx.stockLevel.update({ where: { id: level.id }, data: { quantity: next } });
  await tx.stockMovement.create({
    data: { productId: m.productId, warehouseId: m.warehouseId, type: m.type, quantity: m.quantity, balanceAfter: next, reference: m.reference, note: m.note, userId: m.userId },
  });
  return next;
}

export async function totalStock(productId: string) {
  const r = await prisma.stockLevel.aggregate({ where: { productId }, _sum: { quantity: true } });
  return r._sum.quantity ?? 0;
}

/** After-commit hook: low stock alert + push quantity to linked eBay listings. */
export async function afterStockChange(productIds: string[]) {
  const settings = await prisma.companySetting.findUnique({ where: { id: 1 } });
  for (const id of [...new Set(productIds)]) {
    const p = await prisma.product.findUnique({ where: { id } });
    if (!p) continue;
    const qty = await totalStock(id);
    if (settings?.lowStockAlerts !== false && qty <= p.reorderLevel) {
      await notifyPermission("inventory", "edit", { type: "LOW_STOCK", title: `Low stock: ${p.sku}`, body: `${p.name} has ${qty} units left (reorder level ${p.reorderLevel}).`, link: `/inventory/${p.id}` });
    }
    const { pushListingQuantities } = await import("../ebay/sync");
    await pushListingQuantities(id, qty).catch((e) => console.error("[inventory] eBay qty push failed", e));
  }
}
