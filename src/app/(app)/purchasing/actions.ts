"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPerm, requireUser } from "@/lib/auth";
import { run, zs, formToObject, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { notify, notifyPermission } from "@/lib/notify";
import { nextRef } from "@/lib/refs";
import { recordPRStep } from "@/lib/services/purchasing";
import { applyMovement, afterStockChange, defaultWarehouseId } from "@/lib/services/inventory";
import { quoteTotal } from "@/lib/workflows/purchasing";

export async function createPurchaseRequest(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("purchasing", "create");
    const d = z.object({ productId: zs.str(), quantity: zs.int(1), reason: zs.optStr(3000), priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]) }).parse(formToObject(fd));
    const p = await prisma.product.findUniqueOrThrow({ where: { id: d.productId } });
    const pr = await prisma.purchaseRequest.create({ data: { ...d, reference: await nextRef("PR"), requestedById: u.id, history: [{ at: new Date().toISOString(), by: u.name, byId: u.id, status: "SUBMITTED" }] } });
    await notifyPermission("purchasing", "approve", { type: "PURCHASE_REQUEST", title: `Purchase request ${pr.reference} submitted`, body: `${p.sku} × ${d.quantity} – ${u.name}`, link: `/purchasing/requests/${pr.id}` }, u.id);
    await audit({ userId: u.id, module: "purchasing", action: "create", entity: "PurchaseRequest", entityId: pr.id, summary: `submitted purchase request ${pr.reference} for ${p.sku} × ${d.quantity}` });
    revalidatePath("/purchasing");
    return { ok: true, message: `${pr.reference} submitted for management review.` };
  });
}

export async function advancePR(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    const id = String(fd.get("id"));
    const step = z.enum(["management_review", "request_quotation", "finance_review", "final_approve", "reject", "cancel"]).parse(fd.get("step"));
    const note = String(fd.get("note") || "").trim() || undefined;
    let data: Prisma.PurchaseRequestUpdateInput = {};
    if (step === "management_review") data = { managementReviewById: u.id };
    if (step === "finance_review") {
      const d = z.object({ quotationId: zs.str(), estimatedCost: zs.money(), currency: z.enum(["GBP", "USD", "EUR", "CNY"]) }).parse(formToObject(fd));
      data = { financeReviewById: u.id, selectedQuotationId: d.quotationId, estimatedCost: new Prisma.Decimal(d.estimatedCost), currency: d.currency, financeNote: note };
    }
    if (step === "final_approve") data = { approvedById: u.id };
    if (step === "reject") { if (!note) throw new UserError("A reason is required to reject."); data = { rejectedById: u.id, rejectionReason: note }; }
    if (step === "reject" && !u.can("purchasing", "approve") && !u.can("finance", "approve")) throw new UserError("Not authorised.");
    if (step === "cancel") {
      const cur = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id } });
      if (cur.requestedById !== u.id && !u.can("purchasing", "approve")) throw new UserError("Only the requester or a manager can cancel.");
    }
    if (step === "reject" && !u.can("purchasing", "approve")) {
      const cur = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id } });
      if (!["QUOTED", "FINANCE_REVIEWED"].includes(cur.status)) throw new UserError("Finance can only reject at the finance review stage.");
    }
    const pr = step === "reject" && !u.can("purchasing", "approve")
      ? await prisma.purchaseRequest.update({ where: { id }, data: { ...data, status: "REJECTED" } }) // finance rejection
      : await recordPRStep(id, step, u, note, data);
    const next: Record<string, () => Promise<void>> = {
      management_review: () => notifyPermission("purchasing", "edit", { type: "PURCHASE_REQUEST", title: `${pr.reference}: request supplier quotations`, link: `/purchasing/requests/${id}` }, u.id),
      finance_review: () => notifyPermission("purchasing", "approve", { type: "PAYMENT_APPROVAL", title: `${pr.reference}: finance reviewed – final approval required`, body: `Estimated ${pr.estimatedCost} ${pr.currency}`, link: `/purchasing/requests/${id}` }, u.id),
      final_approve: () => notify([pr.requestedById], { type: "PURCHASE_REQUEST", title: `${pr.reference} approved – purchase order can be generated`, link: `/purchasing/requests/${id}` }),
      reject: () => notify([pr.requestedById], { type: "PURCHASE_REQUEST", title: `${pr.reference} rejected`, body: note, link: `/purchasing/requests/${id}` }),
    };
    await next[step]?.();
    await audit({ userId: u.id, module: "purchasing", action: step, entity: "PurchaseRequest", entityId: id, summary: `${step.replace(/_/g, " ")} on ${pr.reference}${note ? `: ${note}` : ""}` });
    revalidatePath(`/purchasing/requests/${id}`); revalidatePath("/purchasing");
    return { ok: true };
  });
}

/** Step 7–8: generate a PO from the approved request & selected quotation; records an estimated, outstanding supplier cost. */
export async function generatePO(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("purchasing", "create");
    const id = String(fd.get("id"));
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id }, include: { quotations: true, product: true } });
    const q = pr.quotations.find((x) => x.id === pr.selectedQuotationId);
    if (!q) throw new UserError("No quotation was selected during finance review.");
    const qty = Math.max(pr.quantity, q.moq);
    const subtotal = Math.round(qty * Number(q.unitPrice) * 100) / 100;
    const total = quoteTotal({ unitPrice: Number(q.unitPrice), shippingCost: Number(q.shippingCost), moq: q.moq }, pr.quantity);
    const po = await prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: { poNumber: await nextRef("PO"), supplierId: q.supplierId, purchaseRequestId: id, warehouseId: await defaultWarehouseId(tx), status: "ORDERED", currency: q.currency, subtotal, shippingCost: q.shippingCost, total, orderedAt: new Date(), eta: q.leadTimeDays ? new Date(Date.now() + q.leadTimeDays * 86400_000) : null, createdById: u.id, items: { create: [{ productId: pr.productId, quantity: qty, unitCost: q.unitPrice }] } },
      });
      await recordPRStep(id, "create_po", u, `PO ${po.poNumber}`, {}, tx);
      await tx.transaction.create({ data: { type: "EXPENSE", category: "PURCHASE", amount: pr.estimatedCost ?? new Prisma.Decimal(total), currency: pr.estimatedCost ? pr.currency : q.currency, date: new Date(), description: `${po.poNumber} – ${pr.product.sku} × ${qty} (estimated)`, reference: po.poNumber, supplierId: q.supplierId, purchaseOrderId: po.id, isEstimated: true, paymentStatus: "OUTSTANDING", createdById: u.id } });
      return po;
    });
    await notifyPermission("finance", "view", { type: "PURCHASE_ORDER", title: `Purchase order ${po.poNumber} created`, body: `Outstanding supplier payment ${total} ${q.currency}`, link: `/purchasing/orders/${po.id}` }, u.id);
    await audit({ userId: u.id, module: "purchasing", action: "create_po", entity: "PurchaseOrder", entityId: po.id, summary: `generated ${po.poNumber} from ${pr.reference} (${total} ${q.currency})` });
    revalidatePath(`/purchasing/requests/${id}`);
    return { ok: true, message: `${po.poNumber} generated.` };
  });
}

export async function createManualPO(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("purchasing", "manage");
    const d = z.object({ supplierId: zs.str(), productId: zs.str(), quantity: zs.int(1), unitCost: zs.money(), shippingCost: zs.money(), currency: z.enum(["USD", "CNY", "GBP", "EUR"]), notes: zs.optStr(2000) }).parse(formToObject(fd));
    const subtotal = Math.round(d.quantity * d.unitCost * 100) / 100;
    const po = await prisma.purchaseOrder.create({ data: { poNumber: await nextRef("PO"), supplierId: d.supplierId, warehouseId: await defaultWarehouseId(), status: "DRAFT", currency: d.currency, subtotal, shippingCost: d.shippingCost, total: subtotal + d.shippingCost, notes: d.notes, createdById: u.id, items: { create: [{ productId: d.productId, quantity: d.quantity, unitCost: d.unitCost }] } } });
    await audit({ userId: u.id, module: "purchasing", action: "create_po", entity: "PurchaseOrder", entityId: po.id, summary: `created manual ${po.poNumber}` });
    revalidatePath("/purchasing");
    return { ok: true, message: `${po.poNumber} created as draft.` };
  });
}

/** Step 9: shipment tracking updates. */
export async function updatePOShipment(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("purchasing", "edit");
    const id = String(fd.get("id"));
    const d = z.object({ status: z.enum(["DRAFT", "ORDERED", "SHIPPED", "IN_TRANSIT", "CUSTOMS", "CANCELLED"]), carrier: zs.optStr(100), trackingNumber: zs.optStr(100), eta: zs.optDate(), notes: zs.optStr(2000) }).parse(formToObject(fd));
    const before = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id } });
    if (["RECEIVED", "PARTIALLY_RECEIVED"].includes(before.status) && d.status !== before.status) throw new UserError("Stock has already been received for this PO.");
    const po = await prisma.purchaseOrder.update({ where: { id }, data: { ...d, orderedAt: d.status === "ORDERED" && !before.orderedAt ? new Date() : undefined, shippedAt: ["SHIPPED", "IN_TRANSIT"].includes(d.status) && !before.shippedAt ? new Date() : undefined } });
    if (before.status !== d.status && ["SHIPPED", "IN_TRANSIT", "CUSTOMS"].includes(d.status)) await notifyPermission("warehouse", "edit", { type: "SHIPMENT", title: `${po.poNumber} is ${d.status.replace("_", " ").toLowerCase()}`, body: `${d.carrier ?? ""} ${d.trackingNumber ?? ""} ETA ${d.eta?.toLocaleDateString("en-GB") ?? "?"}`, link: `/purchasing/orders/${id}` });
    await audit({ userId: u.id, module: "purchasing", action: "shipment", entity: "PurchaseOrder", entityId: id, summary: `${po.poNumber}: ${before.status} → ${d.status}`, before: { status: before.status, tracking: before.trackingNumber }, after: d });
    revalidatePath(`/purchasing/orders/${id}`);
    return { ok: true, message: "PO updated." };
  });
}

/** Steps 10–11: warehouse confirms receipt → inventory is updated automatically. */
export async function receivePO(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("warehouse", "edit");
    const id = String(fd.get("id"));
    const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, include: { items: { include: { product: true } } } });
    if (["RECEIVED", "CANCELLED", "DRAFT"].includes(po.status)) throw new UserError(`Cannot receive a ${po.status.toLowerCase()} PO.`);
    const touched: string[] = [];
    let complete = true;
    await prisma.$transaction(async (tx) => {
      for (const it of po.items) {
        const qty = z.coerce.number().int().min(0).parse(fd.get(`qty_${it.id}`) ?? 0);
        const damaged = z.coerce.number().int().min(0).parse(fd.get(`dmg_${it.id}`) ?? 0);
        if (qty + damaged + it.receivedQty > it.quantity * 1.1) throw new UserError(`Received quantity for ${it.product.sku} exceeds ordered quantity.`);
        if (qty > 0) { await applyMovement(tx, { productId: it.productId, warehouseId: po.warehouseId, type: "PURCHASE_RECEIPT", quantity: qty, reference: po.poNumber, userId: u.id }); touched.push(it.productId); }
        if (damaged > 0) await tx.stockMovement.create({ data: { productId: it.productId, warehouseId: po.warehouseId, type: "DAMAGED", quantity: 0, balanceAfter: (await tx.stockLevel.findUnique({ where: { productId_warehouseId: { productId: it.productId, warehouseId: po.warehouseId } } }))?.quantity ?? 0, reference: po.poNumber, note: `${damaged} unit(s) arrived damaged – not added to stock`, userId: u.id } });
        const received = it.receivedQty + qty + damaged;
        if (received < it.quantity) complete = false;
        await tx.purchaseOrderItem.update({ where: { id: it.id }, data: { receivedQty: received } });
      }
      await tx.purchaseOrder.update({ where: { id }, data: { status: complete ? "RECEIVED" : "PARTIALLY_RECEIVED", receivedAt: complete ? new Date() : null } });
      if (complete && po.purchaseRequestId) await recordPRStep(po.purchaseRequestId, "receive", u, `Received at warehouse`, {}, tx);
    });
    await afterStockChange(touched);
    const mgmt = await prisma.user.findMany({ where: { deletedAt: null, role: { level: { gte: 80 } } }, select: { id: true } });
    await notify(mgmt.map((m) => m.id), { type: "STOCK_RECEIVED", title: `${po.poNumber} ${complete ? "fully" : "partially"} received`, link: `/purchasing/orders/${id}` });
    await audit({ userId: u.id, module: "warehouse", action: "receive_po", entity: "PurchaseOrder", entityId: id, summary: `received stock for ${po.poNumber} (${complete ? "complete" : "partial"})` });
    revalidatePath(`/purchasing/orders/${id}`); revalidatePath("/inventory");
    return { ok: true, message: complete ? "All items received – inventory updated." : "Partial receipt recorded – inventory updated." };
  });
}
