import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { membership, serializeMessage } from "@/lib/chat";
import { sameOrigin } from "@/lib/http";
import { saveUpload } from "@/lib/storage";
import { publish } from "@/lib/events";
import { notify } from "@/lib/notify";

type P = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: P) {
  const u = await getCurrentUser();
  const { id } = await params;
  if (!u || !(await membership(u, id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q"), before = sp.get("before"), pinned = sp.get("pinned");
  const msgs = await prisma.chatMessage.findMany({
    where: { channelId: id, deletedAt: null, ...(q ? { body: { contains: q, mode: "insensitive" } } : {}), ...(before ? { createdAt: { lt: new Date(before) } } : {}), ...(pinned ? { pinned: true } : {}) },
    include: { sender: { select: { name: true, avatarColor: true } } }, orderBy: { createdAt: "desc" }, take: 60,
  });
  const files = await prisma.fileAsset.findMany({ where: { id: { in: msgs.map((m) => m.fileId).filter(Boolean) as string[] } } });
  const members = await prisma.chatMember.findMany({ where: { channelId: id }, include: { user: { select: { id: true, name: true, avatarColor: true } } } });
  return NextResponse.json({
    messages: msgs.reverse().map((m) => serializeMessage(m, files.find((f) => f.id === m.fileId))),
    members: members.map((m) => ({ id: m.userId, name: m.user.name, color: m.user.avatarColor, lastReadAt: m.lastReadAt.toISOString(), isAdmin: m.isAdmin })),
  });
}

export async function POST(req: Request, { params }: P) {
  const u = await getCurrentUser();
  const { id } = await params;
  if (!u || !u.can("chat", "create")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const m = await membership(u, id);
  if (!m) return NextResponse.json({ error: "Not a member" }, { status: 403 });
  if (m.channel.readOnly && !m.isAdmin && !u.can("chat", "manage")) return NextResponse.json({ error: "This channel is read-only" }, { status: 403 });
  const fd = await req.formData();
  const body = String(fd.get("body") || "").trim().slice(0, 5000);
  const f = fd.get("file");
  let file = null;
  try { if (f instanceof File && f.size) file = await saveUpload(f, u.id, "chat"); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  if (!body && !file) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  const msg = await prisma.chatMessage.create({ data: { channelId: id, senderId: u.id, body: body || "", fileId: file?.id }, include: { sender: { select: { name: true, avatarColor: true } } } });
  await prisma.chatMember.update({ where: { id: m.id }, data: { lastReadAt: new Date() } });
  const members = (await prisma.chatMember.findMany({ where: { channelId: id }, select: { userId: true } })).map((x) => x.userId);
  await publish({ kind: "chat", userIds: members, channelId: id, messageId: msg.id, senderName: u.name, preview: (body || file?.filename || "").slice(0, 100) });
  // Direct messages and @mentions also create a persistent notification
  const mentioned = m.channel.type === "DIRECT" ? members.filter((x) => x !== u.id) : [];
  if (mentioned.length) await prisma.notification.createMany({ data: mentioned.map((userId) => ({ userId, type: "CHAT", title: `Message from ${u.name}`, body: (body || file?.filename || "").slice(0, 140), link: `/chat?c=${id}` })) });
  void notify;
  return NextResponse.json({ message: serializeMessage(msg, file) });
}
