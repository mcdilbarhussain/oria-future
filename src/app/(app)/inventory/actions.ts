"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertPerm } from "@/lib/auth";
import { run, zs, formToObject, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { applyMovement, afterStockChange, defaultWarehouseId } from "@/lib/services/inventory";

const productSchema = z.object({
  sku: z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{2,50}$/, "SKU: 2-50 chars A-Z 0-9 . _ -"), name: zs.str(200), barcode: zs.optStr(60), category: zs.optStr(80), brand: zs.optStr(80),
  description: zs.optStr(5000), costPrice: zs.money(), sellPrice: zs.money(), reorderLevel: zs.int(), reorderQty: zs.int(1), weightKg: zs.optMoney(), preferredSupplierId: zs.optStr(40), imageUrl: zs.optStr(500),
});

export async function saveProduct(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const id = fd.get("id") ? String(fd.get("id")) : null;
    const u = await assertPerm("inventory", id ? "edit" : "create");
    const d = productSchema.parse(formToObject(fd));
    if (id) {
      const before = await prisma.product.findUniqueOrThrow({ where: { id } });
      await prisma.product.update({ where: { id }, data: d });
      await audit({ userId: u.id, module: "inventory", action: "update", entity: "Product", entityId: id, summary: `updated product ${d.sku}`, before, after: d });
    } else {
      const opening = z.coerce.number().int().min(0).default(0).parse(fd.get("openingQty") || 0);
      const p = await prisma.$transaction(async (tx) => {
        const p = await tx.product.create({ data: d });
        if (opening > 0) await applyMovement(tx, { productId: p.id, warehouseId: await defaultWarehouseId(tx), type: "IN", quantity: opening, reference: "Opening stock", userId: u.id });
        return p;
      });
      await audit({ userId: u.id, module: "inventory", action: "create", entity: "Product", entityId: p.id, summary: `added product ${d.sku} – ${d.name}${opening ? ` with ${opening} units` : ""}` });
    }
    revalidatePath("/inventory");
    return { ok: true, message: "Product saved." };
  });
}

export async function archiveProduct(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("inventory", "delete");
    const p = await prisma.product.update({ where: { id: String(fd.get("id")) }, data: { deletedAt: new Date() } });
    await audit({ userId: u.id, module: "inventory", action: "delete", entity: "Product", entityId: p.id, summary: `archived product ${p.sku}` });
    revalidatePath("/inventory");
    return { ok: true, message: "Product archived." };
  });
}

const TYPES = { IN: 1, OUT: -1, DAMAGED: -1, RETURN: 1, ADJUSTMENT: 0 } as const;

/** Record incoming / outgoing / damaged / returned stock or a stock-count adjustment. */
export async function recordMovement(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("warehouse", "create");
    const d = z.object({ productId: zs.str(), warehouseId: zs.str(), type: z.enum(["IN", "OUT", "DAMAGED", "RETURN", "ADJUSTMENT"]), quantity: z.coerce.number().int(), reference: zs.optStr(120), note: zs.optStr(1000) }).parse(formToObject(fd));
    let qty = d.quantity;
    if (d.type === "ADJUSTMENT") {
      // quantity = counted quantity → compute delta
      const cur = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: d.productId, warehouseId: d.warehouseId } } });
      qty = d.quantity - (cur?.quantity ?? 0);
      if (qty === 0) throw new UserError("Counted quantity equals current stock – nothing to adjust.");
    } else {
      if (d.quantity <= 0) throw new UserError("Quantity must be greater than zero.");
      qty = d.quantity * TYPES[d.type];
    }
    const balance = await prisma.$transaction((tx) => applyMovement(tx, { ...d, quantity: qty, userId: u.id }));
    const p = await prisma.product.findUniqueOrThrow({ where: { id: d.productId } });
    await audit({ userId: u.id, module: "warehouse", action: `stock_${d.type.toLowerCase()}`, entity: "Product", entityId: p.id, summary: `${d.type} ${qty > 0 ? "+" : ""}${qty} × ${p.sku} (balance ${balance})${d.reference ? ` ref ${d.reference}` : ""}` });
    await afterStockChange([p.id]);
    revalidatePath("/warehouse"); revalidatePath(`/inventory/${p.id}`); revalidatePath("/inventory");
    return { ok: true, message: `Recorded. New balance: ${balance}` };
  });
}

export async function transferStock(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("warehouse", "edit");
    const d = z.object({ productId: zs.str(), fromId: zs.str(), toId: zs.str(), quantity: zs.int(1), note: zs.optStr(500) }).parse(formToObject(fd));
    if (d.fromId === d.toId) throw new UserError("Choose two different locations.");
    await prisma.$transaction(async (tx) => {
      await applyMovement(tx, { productId: d.productId, warehouseId: d.fromId, type: "TRANSFER_OUT", quantity: -d.quantity, note: d.note, userId: u.id });
      await applyMovement(tx, { productId: d.productId, warehouseId: d.toId, type: "TRANSFER_IN", quantity: d.quantity, note: d.note, userId: u.id });
    });
    await audit({ userId: u.id, module: "warehouse", action: "transfer", entity: "Product", entityId: d.productId, summary: `transferred ${d.quantity} units between warehouses` });
    revalidatePath("/warehouse");
    return { ok: true, message: "Transfer recorded." };
  });
}

export async function setBin(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    await assertPerm("warehouse", "edit");
    await prisma.stockLevel.update({ where: { id: String(fd.get("id")) }, data: { binLocation: String(fd.get("bin") || "").slice(0, 30) || null } });
    revalidatePath("/inventory");
    return { ok: true };
  });
}
