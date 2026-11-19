import crypto from "node:crypto";
import { NextResponse } from "next/server";

/**
 * eBay Marketplace Account Deletion/Closure notifications (mandatory for production keysets).
 * Configure on developer.ebay.com → Alerts & Notifications:
 *   endpoint = {APP_URL}/api/ebay/account-deletion, verification token = EBAY_VERIFICATION_TOKEN
 * We do not store eBay buyer personal data beyond order records; on notification we log receipt.
 */
export async function GET(req: Request) {
  const challenge = new URL(req.url).searchParams.get("challenge_code");
  const token = process.env.EBAY_VERIFICATION_TOKEN;
  const endpoint = process.env.EBAY_DELETION_ENDPOINT || `${process.env.APP_URL}/api/ebay/account-deletion`;
  if (!challenge || !token) return NextResponse.json({ error: "Not configured" }, { status: 400 });
  const challengeResponse = crypto.createHash("sha256").update(challenge + token + endpoint).digest("hex");
  return NextResponse.json({ challengeResponse });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  console.info("[ebay] marketplace account deletion notification received", body?.notification?.data?.username ?? "");
  return new NextResponse(null, { status: 204 });
}
