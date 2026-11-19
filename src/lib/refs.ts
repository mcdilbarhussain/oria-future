import "server-only";
import { prisma } from "./db";

/** Human-friendly sequential references e.g. PO-2026-0007 */
export async function nextRef(prefix: "PO" | "PR" | "ENQ") {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-`;
  const count =
    prefix === "PO" ? await prisma.purchaseOrder.count({ where: { poNumber: { startsWith: like } } })
    : prefix === "PR" ? await prisma.purchaseRequest.count({ where: { reference: { startsWith: like } } })
    : await prisma.priceEnquiry.count({ where: { reference: { startsWith: like } } });
  return `${like}${String(count + 1).padStart(4, "0")}`;
}
