import "server-only";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { prisma } from "../db";
import { getAccessToken, EbayError } from "./oauth";
import { ebayCredentials, ebayHosts, MARKETPLACE_LANG, MARKETPLACE_SITE_ID } from "./config";

type Host = "api" | "apiz";

/** Authenticated REST call to an eBay Sell/Commerce API. */
export async function ebayRest<T = unknown>(accountId: string, method: string, path: string, opts: { body?: unknown; host?: Host; query?: Record<string, string | number | undefined> } = {}): Promise<T> {
  const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: accountId } });
  const token = await getAccessToken(accountId);
  const url = new URL(ebayHosts(acc.environment)[opts.host ?? "api"] + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
  const lang = MARKETPLACE_LANG[acc.marketplaceId] ?? "en-GB";
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Content-Language": lang,
      "Accept-Language": lang,
      "X-EBAY-C-MARKETPLACE-ID": acc.marketplaceId,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const errs = (json?.errors as { message?: string; longMessage?: string }[] | undefined)?.map((e) => e.longMessage || e.message).join("; ");
    throw new EbayError(`eBay API ${method} ${path} failed (${res.status}): ${errs || text.slice(0, 300)}`, res.status, json);
  }
  return json as T;
}

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, isArray: (n) => ["Item", "OrderArray", "Message", "Error", "MemberMessageExchange"].includes(n) });
const builder = new XMLBuilder({ ignoreAttributes: false });

/** Authenticated Trading API (XML) call using the OAuth user token (X-EBAY-API-IAF-TOKEN). */
export async function ebayTrading<T = Record<string, unknown>>(accountId: string, callName: string, body: Record<string, unknown>): Promise<T> {
  const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: accountId } });
  const token = await getAccessToken(accountId);
  const xml = `<?xml version="1.0" encoding="utf-8"?><${callName}Request xmlns="urn:ebay:apis:eBLBaseComponents">${builder.build(body)}</${callName}Request>`;
  const res = await fetch(ebayHosts(acc.environment).trading, {
    method: "POST",
    headers: {
      "X-EBAY-API-IAF-TOKEN": token,
      "X-EBAY-API-CALL-NAME": callName,
      "X-EBAY-API-SITEID": MARKETPLACE_SITE_ID[acc.marketplaceId] ?? "3",
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1349",
      "X-EBAY-API-APP-NAME": ebayCredentials().clientId,
      "X-EBAY-API-DEV-NAME": ebayCredentials().devId,
      "Content-Type": "text/xml",
    },
    body: xml,
    cache: "no-store",
  });
  const out = parser.parse(await res.text());
  const r = out[`${callName}Response`] ?? {};
  if (!res.ok || r.Ack === "Failure") {
    const msg = (r.Errors ?? r.Error ?? []).map?.((e: { LongMessage?: string; ShortMessage?: string }) => e.LongMessage || e.ShortMessage).join("; ");
    throw new EbayError(`eBay Trading ${callName} failed: ${msg || res.status}`, res.status, r);
  }
  return r as T;
}

export { EbayError };
