import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/storage";

/** Public listing images: eBay must be able to download listing pictures, so ONLY files uploaded as listing images are served without auth. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const f = await prisma.fileAsset.findFirst({ where: { id: (await params).id, entityType: "listing-image", mimeType: { startsWith: "image/" } } });
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(await readUpload(f.storageKey)), { headers: { "Content-Type": f.mimeType, "Cache-Control": "public, max-age=86400" } });
}
