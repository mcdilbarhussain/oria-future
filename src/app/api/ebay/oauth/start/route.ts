import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildConsentUrl } from "@/lib/ebay/oauth";
import { audit } from "@/lib/audit";

/** Starts the eBay OAuth (Authorization Code Grant) flow for an account. */
export async function GET(req: Request) {
  const u = await getCurrentUser();
  if (!u || !u.can("ebay_accounts", "manage")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("account") || "";
  const acc = await prisma.ebayAccount.findFirst({ where: { id, deletedAt: null } });
  if (!acc) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  const back = (m: string) => NextResponse.redirect(new URL(`/ebay/accounts/${id}?error=${encodeURIComponent(m)}`, process.env.APP_URL || req.url));
  if (acc.isDemo) return back("Demo accounts cannot be connected. Add a new account instead.");
  try {
    const url = await buildConsentUrl(acc.id, u.id, acc.environment);
    await audit({ userId: u.id, module: "ebay_accounts", action: "oauth_start", entity: "EbayAccount", entityId: acc.id, summary: `started eBay authorisation for ${acc.name}` });
    return NextResponse.redirect(url);
  } catch (e) { return back((e as Error).message); }
}
