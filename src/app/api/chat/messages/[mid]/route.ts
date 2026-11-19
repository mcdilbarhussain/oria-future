import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sameOrigin } from "@/lib/http";
import { publish } from "@/lib/events";

/** Pin/unpin (any member) or delete (sender or chat managers). body: { action: "pin" | "unpin" | "delete" } */
export async function POST(req: Request, { params }: { params: Promise<{ mid: string }> }) {
  const u = await getCurrentUser();
  const { mid } = await params;
  if (!u || !sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const msg = await prisma.chatMessage.findUnique({ where: { id: mid } });
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const member = await prisma.chatMember.findUnique({ where: { channelId_userId: { channelId: msg.channelId, userId: u.id } } });
  if (!member) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { action } = (await req.json()) as { action: string };
  if (action === "delete") {
    if (msg.senderId !== u.id && !u.can("chat", "manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await prisma.chatMessage.update({ where: { id: mid }, data: { deletedAt: new Date() } });
  } else await prisma.chatMessage.update({ where: { id: mid }, data: { pinned: action === "pin" } });
  const members = (await prisma.chatMember.findMany({ where: { channelId: msg.channelId }, select: { userId: true } })).map((x) => x.userId);
  await publish({ kind: "chat", userIds: members, channelId: msg.channelId, messageId: mid, senderName: "", preview: "" });
  return NextResponse.json({ ok: true });
}
