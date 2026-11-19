import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";

/** Authenticated file download. Finance/payroll files require finance permission. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  if (!u) return new Response("Unauthorized", { status: 401 });
  const f = await prisma.fileAsset.findUnique({ where: { id: (await params).id } });
  if (!f) return new Response("Not found", { status: 404 });
  const restricted: Record<string, Parameters<typeof u.can>> = { transaction: ["finance", "view"], payroll: ["payroll", "view"], quotation: ["suppliers", "view"], supplier: ["suppliers", "view"] };
  const need = f.entityType ? restricted[f.entityType] : undefined;
  if (need && !u.can(...need)) return new Response("Forbidden", { status: 403 });
  if (f.entityType === "chat") {
    const msg = await prisma.chatMessage.findFirst({ where: { fileId: f.id }, select: { channelId: true } });
    if (msg && !(await prisma.chatMember.findUnique({ where: { channelId_userId: { channelId: msg.channelId, userId: u.id } } }))) return new Response("Forbidden", { status: 403 });
  }
  const data = await readUpload(f.storageKey);
  const inline = /^image\/|^application\/pdf$/.test(f.mimeType);
  return new Response(new Uint8Array(data), { headers: { "Content-Type": f.mimeType, "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(f.filename)}"`, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
