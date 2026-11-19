import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { membership } from "@/lib/chat";
import { sameOrigin } from "@/lib/http";
import { publish } from "@/lib/events";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getCurrentUser();
  const { id } = await params;
  if (!u || !sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const m = await membership(u, id);
  if (!m) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.chatMember.update({ where: { id: m.id }, data: { lastReadAt: new Date() } });
  const members = (await prisma.chatMember.findMany({ where: { channelId: id }, select: { userId: true } })).map((x) => x.userId);
  await publish({ kind: "chat_read", userIds: members, channelId: id, userId: u.id });
  return NextResponse.json({ ok: true });
}
