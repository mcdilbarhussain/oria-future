import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sameOrigin } from "@/lib/http";

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u || !u.can("chat", "view")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const { userId } = (await req.json()) as { userId: string };
  const other = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!other || other.id === u.id) return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  const key = [u.id, other.id].sort().join(":");
  const ch = await prisma.chatChannel.upsert({ where: { directKey: key }, create: { type: "DIRECT", directKey: key, members: { create: [{ userId: u.id }, { userId: other.id }] } }, update: {} });
  return NextResponse.json({ id: ch.id });
}
