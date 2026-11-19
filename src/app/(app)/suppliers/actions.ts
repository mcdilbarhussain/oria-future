"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPerm } from "@/lib/auth";
import { run, zs, formToObject, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { saveUpload } from "@/lib/storage";
import { notify, notifyPermission } from "@/lib/notify";
import { nextRef } from "@/lib/refs";

const supplierSchema = z.object({
  companyName: zs.str(200), contactPerson: zs.optStr(120), email: z.union([z.literal(""), z.string().email()]).optional().transform((v) => v || null), phone: zs.optStr(50), wechat: zs.optStr(60), website: zs.optStr(200),
  city: zs.optStr(80), province: zs.optStr(80), country: zs.str(60), categories: z.string().optional().transform((v) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [])),
  paymentTerms: zs.optStr(300), currency: z.enum(["USD", "CNY", "GBP", "EUR"]), defaultShippingCost: zs.optMoney(), notes: zs.optStr(5000),
});

export async function saveSupplier(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const id = fd.get("id") ? String(fd.get("id")) : null;
    const u = await assertPerm("suppliers", id ? "edit" : "create");
    const d = supplierSchema.parse(formToObject(fd));
    const s = id ? await prisma.supplier.update({ where: { id }, data: d }) : await prisma.supplier.create({ data: d });
    await audit({ userId: u.id, module: "suppliers", action: id ? "update" : "create", entity: "Supplier", entityId: s.id, summary: `${id ? "updated" : "added"} supplier ${d.companyName}` });
    revalidatePath("/suppliers");
    return { ok: true, message: "Supplier saved." };
  });
}

export async function archiveSupplier(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("suppliers", "delete");
    const s = await prisma.supplier.update({ where: { id: String(fd.get("id")) }, data: { deletedAt: new Date() } });
    await audit({ userId: u.id, module: "suppliers", action: "delete", entity: "Supplier", entityId: s.id, summary: `archived supplier ${s.companyName}` });
    revalidatePath("/suppliers");
    return { ok: true };
  });
}

export async function saveSupplierProduct(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("suppliers", "edit");
    const d = z.object({ supplierId: zs.str(), productId: zs.optStr(40), name: zs.str(200), supplierSku: zs.optStr(80), unitPrice: zs.money(), currency: z.enum(["USD", "CNY", "GBP", "EUR"]), moq: zs.int(1), shippingCostPerUnit: zs.optMoney(), leadTimeDays: z.coerce.number().int().min(0).optional() }).parse(formToObject(fd));
    const id = fd.get("id") ? String(fd.get("id")) : null;
    if (id) await prisma.supplierProduct.update({ where: { id }, data: d }); else await prisma.supplierProduct.create({ data: d });
    await audit({ userId: u.id, module: "suppliers", action: "catalogue", entity: "Supplier", entityId: d.supplierId, summary: `updated catalogue item ${d.name} @ ${d.unitPrice} ${d.currency}` });
    revalidatePath(`/suppliers/${d.supplierId}`);
    return { ok: true, message: "Catalogue updated." };
  });
}

export async function addReview(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("suppliers", "edit");
    const d = z.object({ supplierId: zs.str(), rating: z.coerce.number().int().min(1).max(5), comment: zs.optStr(2000) }).parse(formToObject(fd));
    await prisma.supplierReview.create({ data: { ...d, userId: u.id } });
    const avg = await prisma.supplierReview.aggregate({ where: { supplierId: d.supplierId }, _avg: { rating: true } });
    await prisma.supplier.update({ where: { id: d.supplierId }, data: { rating: new Prisma.Decimal((avg._avg.rating ?? 0).toFixed(1)) } });
    revalidatePath(`/suppliers/${d.supplierId}`);
    return { ok: true, message: "Review added." };
  });
}

export async function logCommunication(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("suppliers", "edit");
    const d = z.object({ supplierId: zs.str(), channel: z.enum(["EMAIL", "WECHAT", "PHONE", "ALIBABA", "MEETING", "OTHER"]), subject: zs.optStr(200), summary: zs.str(5000), occurredAt: zs.optDate() }).parse(formToObject(fd));
    const c = await prisma.supplierCommunication.create({ data: { ...d, occurredAt: d.occurredAt ?? new Date(), userId: u.id } });
    for (const f of fd.getAll("files")) if (f instanceof File && f.size) await saveUpload(f, u.id, "supplier", d.supplierId);
    void c;
    revalidatePath(`/suppliers/${d.supplierId}`);
    return { ok: true, message: "Communication logged." };
  });
}

/** Add a supplier quotation to an enquiry or purchase request (with optional attachment). */
export async function addQuotation(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const d = z.object({ supplierId: zs.str(), enquiryId: zs.optStr(40), purchaseRequestId: zs.optStr(40), unitPrice: zs.money(), currency: z.enum(["USD", "CNY", "GBP", "EUR"]), moq: zs.int(1), shippingCost: zs.money(), leadTimeDays: z.coerce.number().int().min(0).optional(), validUntil: zs.optDate(), notes: zs.optStr(2000) }).parse(formToObject(fd));
    const u = await assertPerm(d.purchaseRequestId ? "purchasing" : "enquiries", "edit");
    if (!d.enquiryId && !d.purchaseRequestId) throw new UserError("Quotation must belong to an enquiry or purchase request.");
    if (d.purchaseRequestId) {
      const pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: d.purchaseRequestId } });
      if (!["QUOTATION_REQUESTED", "QUOTED"].includes(pr.status)) throw new UserError("Quotations can only be added after management requests them.");
    }
    const f = fd.get("file");
    const q = await prisma.quotation.create({ data: { ...d, createdById: u.id } });
    if (f instanceof File && f.size) { const file = await saveUpload(f, u.id, "quotation", q.id); if (file) await prisma.quotation.update({ where: { id: q.id }, data: { fileId: file.id } }); }
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { id: d.supplierId } });
    if (d.enquiryId) {
      const e = await prisma.priceEnquiry.update({ where: { id: d.enquiryId }, data: { status: "QUOTING" } });
      await notify([e.requestedById].filter((x) => x !== u.id), { type: "QUOTATION", title: `Quotation received for ${e.reference}`, body: `${supplier.companyName}: ${d.unitPrice} ${d.currency}/unit, MOQ ${d.moq}`, link: `/enquiries/${e.id}` });
      revalidatePath(`/enquiries/${e.id}`);
    }
    if (d.purchaseRequestId) {
      const { recordPRStep } = await import("@/lib/services/purchasing");
      await recordPRStep(d.purchaseRequestId, "add_quotation", u, `Quotation from ${supplier.companyName}`);
      await notifyPermission("finance", "approve", { type: "QUOTATION", title: "Supplier quotation received – finance review needed", body: `${supplier.companyName}: ${d.unitPrice} ${d.currency}/unit`, link: `/purchasing/requests/${d.purchaseRequestId}` });
      revalidatePath(`/purchasing/requests/${d.purchaseRequestId}`);
    }
    await audit({ userId: u.id, module: "suppliers", action: "quotation", entity: "Quotation", entityId: q.id, summary: `recorded quotation from ${supplier.companyName}: ${d.unitPrice} ${d.currency}/unit` });
    return { ok: true, message: "Quotation saved." };
  });
}

// ───────── Price enquiries ─────────
export async function createEnquiry(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("enquiries", "create");
    const d = z.object({ productId: zs.optStr(40), productName: z.string().trim().max(200).optional(), quantity: zs.int(1), targetPrice: zs.optMoney(), notes: zs.optStr(3000) }).parse(formToObject(fd));
    let name = d.productName;
    if (d.productId) name = (await prisma.product.findUniqueOrThrow({ where: { id: d.productId } })).name;
    if (!name) throw new UserError("Select a product or enter a product name.");
    const e = await prisma.priceEnquiry.create({ data: { ...d, productName: name, reference: await nextRef("ENQ"), requestedById: u.id } });
    await notifyPermission("enquiries", "approve", { type: "PRICE_ENQUIRY", title: `Price enquiry ${e.reference}: ${name}`, body: `${d.quantity} units – from ${u.name}`, link: `/enquiries/${e.id}` }, u.id);
    await audit({ userId: u.id, module: "enquiries", action: "create", entity: "PriceEnquiry", entityId: e.id, summary: `submitted price enquiry ${e.reference} for ${name}` });
    revalidatePath("/enquiries");
    return { ok: true, message: `Enquiry ${e.reference} sent to management.` };
  });
}

export async function recommendQuote(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("enquiries", "edit");
    const id = String(fd.get("id"));
    const d = z.object({ quotationId: zs.str(), recommendation: zs.str(3000) }).parse(formToObject(fd));
    const e = await prisma.priceEnquiry.update({ where: { id }, data: { status: "RECOMMENDED", recommendedQuotationId: d.quotationId, recommendation: d.recommendation } });
    await notifyPermission("enquiries", "approve", { type: "PRICE_ENQUIRY", title: `Purchasing recommendation for ${e.reference}`, body: d.recommendation.slice(0, 140), link: `/enquiries/${id}` }, u.id);
    await audit({ userId: u.id, module: "enquiries", action: "recommend", entity: "PriceEnquiry", entityId: id, summary: `recommended a quotation for ${e.reference}` });
    revalidatePath(`/enquiries/${id}`);
    return { ok: true, message: "Recommendation submitted to management." };
  });
}

export async function decideEnquiry(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("enquiries", "approve");
    const id = String(fd.get("id"));
    const status = z.enum(["APPROVED", "REJECTED"]).parse(fd.get("status"));
    const e = await prisma.priceEnquiry.update({ where: { id }, data: { status, reviewedById: u.id, reviewNote: String(fd.get("note") || "") || null } });
    await notify([e.requestedById], { type: "PRICE_ENQUIRY", title: `Enquiry ${e.reference} ${status.toLowerCase()}`, body: String(fd.get("note") || "") || undefined, link: `/enquiries/${id}` });
    await audit({ userId: u.id, module: "enquiries", action: status.toLowerCase(), entity: "PriceEnquiry", entityId: id, summary: `${status.toLowerCase()} enquiry ${e.reference}` });
    revalidatePath(`/enquiries/${id}`);
    return { ok: true };
  });
}
