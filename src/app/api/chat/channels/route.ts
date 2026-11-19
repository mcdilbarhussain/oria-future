import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { channelsFor } from "@/lib/chat";
import { prisma } from "@/lib/db";
import { sameOrigin } from "@/lib/http";
import { audit } from "@/lib/audit";
import { publish } from "@/lib/events";

export async function GET() {
  const u = await getCurrentUser();
  if (!u || !u.can("chat", "view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ channels: await channelsFor(u) });
}

/** Create a group (requires chat:manage – management controls group access). */
export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || !u.can("chat", "manage")) return NextResponse.json({ error: "Only management can create groups" }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const b = (await req.json()) as { name?: string; memberIds?: string[]; readOnly?: boolean };
  const name = (b.name || "").trim().slice(0, 60);
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const ids = [...new Set([u.id, ...(b.memberIds ?? [])])];
  const ch = await prisma.chatChannel.create({ data: { type: "GROUP", name, readOnly: !!b.readOnly, members: { create: ids.map((userId) => ({ userId, isAdmin: userId === u.id })) } } });
  await audit({ userId: u.id, module: "chat", action: "create_group", entity: "ChatChannel", entityId: ch.id, summary: `created chat group ${name} (${ids.length} members)` });
  await publish({ kind: "refresh", userIds: ids, scope: "chat" });
  return NextResponse.json({ id: ch.id });
}
