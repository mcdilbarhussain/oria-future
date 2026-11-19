import PDFDocument from "pdfkit";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fileResponse } from "@/lib/export";

/** Printable purchase order PDF to send to the supplier. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u || !u.can("purchasing", "view")) return new Response("Forbidden", { status: 403 });
  const po = await prisma.purchaseOrder.findUnique({ where: { id: (await params).id }, include: { supplier: true, warehouse: true, items: { include: { product: true } } } });
  if (!po) return new Response("Not found", { status: 404 });
  const co = await prisma.companySetting.findUnique({ where: { id: 1 } });
  const buf = await new Promise<Buffer>((resolve) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = []; doc.on("data", (c) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.rect(0, 0, doc.page.width, 80).fill("#0c1630");
    doc.fillColor("#d4a93a").font("Helvetica-Bold").fontSize(20).text(co?.companyName ?? "ORIA FUTURE", 48, 24);
    doc.fillColor("#fff").font("Helvetica").fontSize(9).text(co?.address ?? "", 48, 50);
    doc.fillColor("#0c1630").font("Helvetica-Bold").fontSize(18).text("PURCHASE ORDER", 48, 100);
    doc.font("Helvetica").fontSize(10).fillColor("#334155").text(`PO number: ${po.poNumber}\nDate: ${(po.orderedAt ?? po.createdAt).toLocaleDateString("en-GB")}\nCurrency: ${po.currency}`, 48, 126);
    doc.font("Helvetica-Bold").text("Supplier", 320, 126).font("Helvetica").text(`${po.supplier.companyName}\n${po.supplier.contactPerson ?? ""}\n${[po.supplier.city, po.supplier.country].filter(Boolean).join(", ")}\n${po.supplier.email ?? ""}`, 320, 140);
    doc.font("Helvetica-Bold").text("Deliver to", 48, 190).font("Helvetica").text(`${po.warehouse.name}\n${po.warehouse.address ?? ""}\n${po.warehouse.country}`, 48, 204);
    let y = 270;
    doc.rect(48, y, 500, 18).fill("#1b2e5a"); doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9);
    [["SKU", 52], ["Description", 150], ["Qty", 360], ["Unit", 410], ["Total", 480]].forEach(([t, x]) => doc.text(String(t), Number(x), y + 5));
    y += 24; doc.font("Helvetica").fillColor("#1e293b");
    for (const i of po.items) { doc.text(i.product.sku, 52, y).text(i.product.name, 150, y, { width: 200 }).text(String(i.quantity), 360, y).text(Number(i.unitCost).toFixed(2), 410, y).text((Number(i.unitCost) * i.quantity).toFixed(2), 480, y); y += 20; }
    y += 10; doc.moveTo(320, y).lineTo(548, y).stroke("#cbd5e1"); y += 8;
    doc.text("Subtotal", 360, y).text(Number(po.subtotal).toFixed(2), 480, y); y += 16;
    doc.text("Shipping", 360, y).text(Number(po.shippingCost).toFixed(2), 480, y); y += 16;
    doc.font("Helvetica-Bold").text(`Total (${po.currency})`, 360, y).text(Number(po.total).toFixed(2), 480, y); y += 40;
    doc.font("Helvetica").fontSize(9).fillColor("#475569").text(`Payment terms: ${po.supplier.paymentTerms ?? "As agreed"}`, 48, y);
    if (po.notes) doc.text(`Notes: ${po.notes}`, 48, y + 14, { width: 500 });
    doc.end();
  });
  return fileResponse(buf, `${po.poNumber}.pdf`, "application/pdf");
}
