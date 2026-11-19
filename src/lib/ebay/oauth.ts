import "server-only";
import { prisma } from "../db";
import { decrypt, encrypt, randomToken } from "../crypto";
import { EBAY_SCOPES, ebayCredentials, ebayHosts, type EbayEnvName } from "./config";

export class EbayError extends Error {
  constructor(msg: string, public status?: number, public body?: unknown) { super(msg); this.name = "EbayError"; }
}

/** Step 1 – build the eBay consent URL (Authorization Code Grant). */
export async function buildConsentUrl(ebayAccountId: string, userId: string, env: EbayEnvName) {
  const { clientId, ruName, configured } = ebayCredentials();
  if (!configured) throw new EbayError("eBay API credentials are not configured on the server (EBAY_CLIENT_ID, EBAY_CLIENT_SECRET, EBAY_RUNAME).");
  const state = randomToken(24);
  await prisma.ebayOAuthState.create({ data: { state, ebayAccountId, userId, expiresAt: new Date(Date.now() + 15 * 60_000) } });
  const u = new URL(`${ebayHosts(env).auth}/oauth2/authorize`);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", ruName);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", EBAY_SCOPES.join(" "));
  u.searchParams.set("state", state);
  u.searchParams.set("prompt", "login");
  return u.toString();
}

async function tokenRequest(env: EbayEnvName, body: Record<string, string>) {
  const { clientId, clientSecret } = ebayCredentials();
  const res = await fetch(`${ebayHosts(env).api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams(body),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new EbayError(`eBay token request failed: ${json.error_description || json.error || res.status}`, res.status, json);
  return json as { access_token: string; expires_in: number; refresh_token?: string; refresh_token_expires_in?: number; token_type: string };
}

/** Step 2 – exchange the authorization code (callback) for tokens and store them encrypted. */
export async function exchangeCode(state: string, code: string) {
  const st = await prisma.ebayOAuthState.findUnique({ where: { state } });
  if (!st || st.expiresAt < new Date()) throw new EbayError("The authorization request has expired or is invalid. Please try connecting again.");
  await prisma.ebayOAuthState.delete({ where: { state } });
  const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: st.ebayAccountId } });
  const t = await tokenRequest(acc.environment, { grant_type: "authorization_code", code, redirect_uri: ebayCredentials().ruName });
  const now = Date.now();
  await prisma.ebayAccount.update({
    where: { id: acc.id },
    data: {
      accessTokenEnc: encrypt(t.access_token),
      refreshTokenEnc: t.refresh_token ? encrypt(t.refresh_token) : undefined,
      accessTokenExpiresAt: new Date(now + t.expires_in * 1000),
      refreshTokenExpiresAt: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000) : undefined,
      scopes: EBAY_SCOPES, status: "CONNECTED", connectedAt: new Date(), lastSyncError: null,
    },
  });
  return { accountId: acc.id, userId: st.userId };
}

/** Returns a valid access token, refreshing it (and persisting) when within 5 minutes of expiry. */
export async function getAccessToken(ebayAccountId: string): Promise<string> {
  const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: ebayAccountId } });
  if (acc.isDemo) throw new EbayError("Demo account – not connected to eBay.");
  if (!acc.accessTokenEnc || !acc.refreshTokenEnc) throw new EbayError("Account is not authorised with eBay.");
  if (acc.accessTokenExpiresAt && acc.accessTokenExpiresAt.getTime() - Date.now() > 5 * 60_000) return decrypt(acc.accessTokenEnc);
  if (acc.refreshTokenExpiresAt && acc.refreshTokenExpiresAt < new Date()) {
    await prisma.ebayAccount.update({ where: { id: acc.id }, data: { status: "EXPIRED" } });
    throw new EbayError("The eBay refresh token has expired – the account must be re-authorised.");
  }
  try {
    const t = await tokenRequest(acc.environment, { grant_type: "refresh_token", refresh_token: decrypt(acc.refreshTokenEnc), scope: (acc.scopes.length ? acc.scopes : EBAY_SCOPES).join(" ") });
    await prisma.ebayAccount.update({
      where: { id: acc.id },
      data: { accessTokenEnc: encrypt(t.access_token), accessTokenExpiresAt: new Date(Date.now() + t.expires_in * 1000), status: "CONNECTED" },
    });
    return t.access_token;
  } catch (e) {
    if (e instanceof EbayError && e.status && e.status < 500) {
      await prisma.ebayAccount.update({ where: { id: acc.id }, data: { status: "EXPIRED", lastSyncError: e.message } });
    }
    throw e;
  }
}

export async function revokeLocalTokens(ebayAccountId: string) {
  await prisma.ebayAccount.update({
    where: { id: ebayAccountId },
    data: { accessTokenEnc: null, refreshTokenEnc: null, accessTokenExpiresAt: null, refreshTokenExpiresAt: null, status: "DISCONNECTED" },
  });
}
