import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sameOrigin } from "@/lib/http";

export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Math.min(50, Number(new URL(req.url).searchParams.get("limit") || 20));
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, take: limit }),
    prisma.notification.count({ where: { userId: u.id, readAt: null } }),
  ]);
  return NextResponse.json({ items, unread });
}

export async function POST(req: Request) {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { all?: boolean; id?: string };
  await prisma.notification.updateMany({ where: { userId: u.id, readAt: null, ...(body.all ? {} : { id: body.id }) }, data: { readAt: new Date() } });
  return NextResponse.json({ ok: true });
}
