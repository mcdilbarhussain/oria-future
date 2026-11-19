import { requirePage } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { channelsFor } from "@/lib/chat";
import { ChatApp } from "./chat-app";

export const metadata = { title: "Team Chat" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const u = await requirePage("chat");
  const { c } = await searchParams;
  const [channels, people] = await Promise.all([
    channelsFor(u),
    prisma.user.findMany({ where: { deletedAt: null, status: "ACTIVE", id: { not: u.id } }, select: { id: true, name: true, avatarColor: true, jobTitle: true }, orderBy: { name: "asc" } }),
  ]);
  return <ChatApp me={{ id: u.id, name: u.name }} initialChannels={channels} people={people} initialChannel={c ?? channels[0]?.id} canManage={u.can("chat", "manage")} canPost={u.can("chat", "create")} />;
}
