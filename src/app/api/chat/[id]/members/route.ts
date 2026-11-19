import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sameOrigin } from "@/lib/http";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";

/** Management controls group membership. body: { add?: string[]; remove?: string[]; readOnly?: boolean } */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  const { id } = await params;
  if (!u || !u.can("chat", "manage") || !sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const ch = await prisma.chatChannel.findUnique({ where: { id } });
  if (!ch || ch.type === "DIRECT") return NextResponse.json({ error: "Not a group" }, { status: 400 });
  const b = (await req.json()) as { add?: string[]; remove?: string[]; readOnly?: boolean };
  for (const userId of b.add ?? []) await prisma.chatMember.upsert({ where: { channelId_userId: { channelId: id, userId } }, create: { channelId: id, userId }, update: {} });
  if (b.remove?.length) await prisma.chatMember.deleteMany({ where: { channelId: id, userId: { in: b.remove } } });
  if (typeof b.readOnly === "boolean") await prisma.chatChannel.update({ where: { id }, data: { readOnly: b.readOnly } });
  await audit({ userId: u.id, module: "chat", action: "members", entity: "ChatChannel", entityId: id, summary: `updated access for group ${ch.name} (+${b.add?.length ?? 0}/-${b.remove?.length ?? 0})` });
  await publish({ kind: "refresh", userIds: [...(b.add ?? []), ...(b.remove ?? [])], scope: "chat" });
  return NextResponse.json({ ok: true });
}
