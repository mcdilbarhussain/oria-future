import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { runScheduledJobs } from "@/lib/jobs";

/** External cron trigger (e.g. system cron, GitHub Actions, Render cron). Authorization: Bearer <CRON_SECRET> */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || got.length !== secret.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, result: await runScheduledJobs() });
}
