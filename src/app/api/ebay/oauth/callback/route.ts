import { NextResponse } from "next/server";
import { exchangeCode } from "@/lib/ebay/oauth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { syncAccount, testConnection } from "@/lib/ebay/sync";

/** eBay redirects here (the RuName "Auth accepted URL") with ?code=&state= */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const base = process.env.APP_URL || req.url;
  const state = sp.get("state") || "";
  const code = sp.get("code");
  if (!code) {
    const st = state ? await prisma.ebayOAuthState.findUnique({ where: { state } }) : null;
    return NextResponse.redirect(new URL(`/ebay/accounts/${st?.ebayAccountId ?? ""}?error=${encodeURIComponent("Authorisation was declined on eBay.")}`, base));
  }
  try {
    const { accountId, userId } = await exchangeCode(state, code);
    await audit({ userId, module: "ebay_accounts", action: "connected", entity: "EbayAccount", entityId: accountId, summary: "eBay account authorised – OAuth tokens stored encrypted" });
    // Best-effort initial identity check + sync (errors are recorded in SyncLog)
    void testConnection(accountId).catch(() => {}).then(() => syncAccount(accountId).catch(() => {}));
    return NextResponse.redirect(new URL(`/ebay/accounts/${accountId}?connected=1`, base));
  } catch (e) {
    return NextResponse.redirect(new URL(`/ebay/accounts?error=${encodeURIComponent((e as Error).message)}`, base));
  }
}
