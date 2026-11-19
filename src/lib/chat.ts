import "server-only";
import { prisma } from "./db";
import type { CurrentUser } from "./auth";

export async function membership(u: CurrentUser, channelId: string) {
  return prisma.chatMember.findUnique({ where: { channelId_userId: { channelId, userId: u.id } }, include: { channel: true } });
}

export async function channelsFor(u: CurrentUser) {
  const ms = await prisma.chatMember.findMany({
    where: { userId: u.id, channel: { archivedAt: null } },
    include: { channel: { include: { members: { include: { user: { select: { id: true, name: true, avatarColor: true } } } }, messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { name: true } } } } } } },
  });
  const out = [];
  for (const m of ms) {
    const unread = await prisma.chatMessage.count({ where: { channelId: m.channelId, createdAt: { gt: m.lastReadAt }, senderId: { not: u.id }, deletedAt: null } });
    const other = m.channel.type === "DIRECT" ? m.channel.members.find((x) => x.userId !== u.id)?.user : undefined;
    const last = m.channel.messages[0];
    out.push({
      id: m.channelId, type: m.channel.type, name: other?.name ?? m.channel.name ?? "Chat", otherUserId: other?.id, color: other?.avatarColor,
      readOnly: m.channel.readOnly, memberCount: m.channel.members.length, unread,
      last: last ? { body: last.body.slice(0, 80), at: last.createdAt.toISOString(), sender: last.sender.name } : null,
    });
  }
  return out.sort((a, b) => (b.last?.at ?? "").localeCompare(a.last?.at ?? ""));
}

export function serializeMessage(m: { id: string; body: string; createdAt: Date; editedAt: Date | null; pinned: boolean; fileId: string | null; senderId: string; sender: { name: string; avatarColor: string } }, file?: { filename: string; mimeType: string } | null) {
  return { id: m.id, body: m.body, at: m.createdAt.toISOString(), pinned: m.pinned, senderId: m.senderId, senderName: m.sender.name, senderColor: m.sender.avatarColor, file: m.fileId && file ? { id: m.fileId, name: file.filename, image: file.mimeType.startsWith("image/") } : null };
}
