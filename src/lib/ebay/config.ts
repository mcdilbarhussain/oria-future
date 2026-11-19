import "server-only";

export type EbayEnvName = "SANDBOX" | "PRODUCTION";

export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
  "https://api.ebay.com/oauth/api_scope/sell.analytics.readonly",
  "https://api.ebay.com/oauth/api_scope/sell.finances",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
];

export function ebayHosts(env: EbayEnvName) {
  const sb = env === "SANDBOX";
  return {
    auth: sb ? "https://auth.sandbox.ebay.com" : "https://auth.ebay.com",
    api: sb ? "https://api.sandbox.ebay.com" : "https://api.ebay.com",
    apiz: sb ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com",
    trading: sb ? "https://api.sandbox.ebay.com/ws/api.dll" : "https://api.ebay.com/ws/api.dll",
  };
}

export function ebayCredentials() {
  const clientId = process.env.EBAY_CLIENT_ID || "";
  const clientSecret = process.env.EBAY_CLIENT_SECRET || "";
  const ruName = process.env.EBAY_RUNAME || "";
  return { clientId, clientSecret, ruName, devId: process.env.EBAY_DEV_ID || "", configured: Boolean(clientId && clientSecret && ruName) };
}

export const MARKETPLACE_LANG: Record<string, string> = {
  EBAY_GB: "en-GB", EBAY_US: "en-US", EBAY_DE: "de-DE", EBAY_FR: "fr-FR", EBAY_IT: "it-IT", EBAY_ES: "es-ES", EBAY_AU: "en-AU", EBAY_IE: "en-IE",
};
export const MARKETPLACE_SITE_ID: Record<string, string> = { EBAY_GB: "3", EBAY_US: "0", EBAY_DE: "77", EBAY_FR: "71", EBAY_IT: "101", EBAY_ES: "186", EBAY_AU: "15", EBAY_IE: "205" };
