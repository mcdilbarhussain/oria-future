import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { ebayRest, ebayTrading, EbayError } from "./client";
import { getAccessToken } from "./oauth";
import { ebayHosts } from "./config";
import { notify, usersWithPermission } from "../notify";
import { applyMovement, defaultWarehouseId, afterStockChange } from "../services/inventory";

/*
 * eBay synchronisation. Official APIs used:
 *  - Sell Fulfillment API  GET  /sell/fulfillment/v1/order                       (orders)
 *  - Sell Fulfillment API  POST /sell/fulfillment/v1/order/{id}/shipping_fulfillment (dispatch)
 *  - Trading API           GetMyeBaySelling                                       (active / sold / unsold listings)
 *  - Trading API           GetMemberMessages / AddMemberMessageRTQ                (buyer questions & replies)
 *  - Sell Inventory API    inventory_item / offer / publish / withdraw            (listing publishing)
 *  - Post-Order API        GET  /post-order/v2/return/search                      (returns)
 *  - Sell Analytics API    GET  /sell/analytics/v1/seller_standards_profile       (account performance)
 *  - Sell Account API      fulfillment/payment/return policies, inventory locations
 *
 * STATUS: implemented against eBay's public documentation; must be verified in the eBay Sandbox
 * with real application keys before production use (see docs/EBAY_SETUP.md).
 */

async function log<T>(accountId: string, kind: string, fn: () => Promise<number>): Promise<{ ok: boolean; count: number; error?: string }> {
  const l = await prisma.syncLog.create({ data: { ebayAccountId: accountId, kind, status: "RUNNING" } });
  try {
    const count = await fn();
    await prisma.syncLog.update({ where: { id: l.id }, data: { status: "SUCCESS", itemsProcessed: count, finishedAt: new Date() } });
    return { ok: true, count };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.syncLog.update({ where: { id: l.id }, data: { status: "FAILED", message: msg.slice(0, 1000), finishedAt: new Date() } });
    return { ok: false, count: 0, error: msg };
  }
}

type EbayOrderJson = {
  orderId: string; creationDate: string; orderFulfillmentStatus: string; orderPaymentStatus: string;
  buyer?: { username?: string };
  pricingSummary?: { total?: { value: string; currency: string }; deliveryCost?: { value: string } };
  totalFeeBasisAmount?: { value: string };
  totalMarketplaceFee?: { value: string };
  fulfillmentStartInstructions?: { shippingStep?: { shipTo?: { fullName?: string; contactAddress?: { city?: string; postalCode?: string; countryCode?: string } } }; maxEstimatedDeliveryDate?: string }[];
  lineItems: { lineItemId: string; sku?: string; title: string; quantity: number; legacyItemId?: string; lineItemCost?: { value: string } }[];
  paymentSummary?: { refunds?: { amount?: { value: string } }[] };
};

export async function syncOrders(accountId: string) {
  return log(accountId, "ORDERS", async () => {
    const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: accountId } });
    const since = acc.lastSyncAt ? new Date(acc.lastSyncAt.getTime() - 2 * 86400_000) : new Date(Date.now() - 90 * 86400_000);
    let offset = 0, processed = 0;
    const newOrders: string[] = [];
    const touched: string[] = [];
    for (;;) {
      const page = await ebayRest<{ orders?: EbayOrderJson[]; total: number }>(accountId, "GET", "/sell/fulfillment/v1/order", {
        query: { filter: `lastmodifieddate:[${since.toISOString()}..]`, limit: 200, offset },
      });
      for (const o of page.orders ?? []) {
        const shipTo = o.fulfillmentStartInstructions?.[0]?.shippingStep?.shipTo;
        const refunded = (o.paymentSummary?.refunds ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0);
        const data = {
          buyerUsername: o.buyer?.username, buyerName: shipTo?.fullName,
          shipToCity: shipTo?.contactAddress?.city, shipToPostcode: shipTo?.contactAddress?.postalCode, shipToCountry: shipTo?.contactAddress?.countryCode,
          orderStatus: o.orderFulfillmentStatus, paymentStatus: o.orderPaymentStatus,
          total: new Prisma.Decimal(o.pricingSummary?.total?.value ?? 0), currency: o.pricingSummary?.total?.currency ?? "GBP",
          deliveryCost: new Prisma.Decimal(o.pricingSummary?.deliveryCost?.value ?? 0),
          fees: o.totalMarketplaceFee ? new Prisma.Decimal(o.totalMarketplaceFee.value) : undefined,
          refundedAmount: new Prisma.Decimal(refunded),
          orderedAt: new Date(o.creationDate), raw: o as unknown as Prisma.InputJsonValue,
        };
        const existing = await prisma.ebayOrder.findUnique({ where: { ebayAccountId_orderId: { ebayAccountId: accountId, orderId: o.orderId } } });
        if (existing) {
          await prisma.ebayOrder.update({ where: { id: existing.id }, data });
        } else {
          await prisma.$transaction(async (tx) => {
            const products = await tx.product.findMany({ where: { sku: { in: o.lineItems.map((l) => l.sku).filter(Boolean) as string[] } } });
            const created = await tx.ebayOrder.create({
              data: {
                ...data, ebayAccountId: accountId, orderId: o.orderId,
                items: { create: o.lineItems.map((l) => ({ lineItemId: l.lineItemId, sku: l.sku, title: l.title, quantity: l.quantity, ebayItemId: l.legacyItemId, unitPrice: new Prisma.Decimal(Number(l.lineItemCost?.value ?? 0) / Math.max(1, l.quantity)), productId: products.find((p) => p.sku === l.sku)?.id })) },
              },
            });
            // Deduct stock from the default UK warehouse for matched SKUs
            const wh = await defaultWarehouseId(tx);
            for (const l of o.lineItems) {
              const p = products.find((x) => x.sku === l.sku);
              if (!p) continue;
              await applyMovement(tx, { productId: p.id, warehouseId: wh, type: "SALE", quantity: -l.quantity, reference: `eBay ${o.orderId}`, note: acc.name, allowNegative: true });
              touched.push(p.id);
            }
            // Record sales revenue (actual) against the account
            await tx.transaction.create({
              data: { type: "INCOME", category: "SALES", amount: data.total, currency: data.currency, date: data.orderedAt, description: `eBay order ${o.orderId}`, reference: o.orderId, ebayAccountId: accountId, ebayOrderId: created.id, createdById: (await systemUserId(tx)) },
            });
          });
          newOrders.push(o.orderId);
        }
        processed++;
      }
      offset += 200;
      if (!page.orders?.length || offset >= page.total) break;
    }
    if (newOrders.length) {
      const ids = await accountUsers(accountId, "ebay_orders");
      await notify(ids, { type: "NEW_ORDER", title: `${newOrders.length} new eBay order(s) – ${acc.name}`, body: newOrders.slice(0, 5).join(", "), link: `/ebay/orders?account=${accountId}` });
    }
    if (touched.length) await afterStockChange(touched);
    return processed;
  });
}

type TradingItem = { ItemID: string; SKU?: string; Title: string; Quantity?: string; QuantityAvailable?: string; WatchCount?: string; SellingStatus?: { CurrentPrice?: string; QuantitySold?: string }; PictureDetails?: { GalleryURL?: string } };

export async function syncListings(accountId: string) {
  return log(accountId, "LISTINGS", async () => {
    let count = 0;
    for (const list of ["ActiveList", "UnsoldList"] as const) {
      for (let page = 1; page <= 20; page++) {
        const r = await ebayTrading<Record<string, { ItemArray?: { Item?: TradingItem[] }; PaginationResult?: { TotalNumberOfPages?: string } }>>(accountId, "GetMyeBaySelling", {
          [list]: { Include: "true", Pagination: { EntriesPerPage: 200, PageNumber: page } }, DetailLevel: "ReturnAll",
        });
        const items = r[list]?.ItemArray?.Item ?? [];
        for (const it of items) {
          const sku = it.SKU || `ITEM-${it.ItemID}`;
          const product = it.SKU ? await prisma.product.findUnique({ where: { sku: it.SKU } }) : null;
          const qty = Number(it.QuantityAvailable ?? it.Quantity ?? 0);
          const status = list === "UnsoldList" ? "ENDED" : qty > 0 ? "ACTIVE" : "OUT_OF_STOCK";
          await prisma.ebayListing.upsert({
            where: { ebayAccountId_sku: { ebayAccountId: accountId, sku } },
            create: { ebayAccountId: accountId, sku, title: it.Title, price: new Prisma.Decimal(it.SellingStatus?.CurrentPrice ?? 0), quantity: qty, ebayItemId: it.ItemID, watchers: Number(it.WatchCount ?? 0), soldQuantity: Number(it.SellingStatus?.QuantitySold ?? 0), status, productId: product?.id, imageUrls: it.PictureDetails?.GalleryURL ? [it.PictureDetails.GalleryURL] : [] },
            update: { title: it.Title, price: new Prisma.Decimal(it.SellingStatus?.CurrentPrice ?? 0), quantity: qty, ebayItemId: it.ItemID, watchers: Number(it.WatchCount ?? 0), soldQuantity: Number(it.SellingStatus?.QuantitySold ?? 0), status },
          });
          count++;
        }
        if (page >= Number(r[list]?.PaginationResult?.TotalNumberOfPages ?? 1)) break;
      }
    }
    return count;
  });
}

type MemberMessageExchange = { Item?: { ItemID?: string; Title?: string }; Question?: { MessageID: string; SenderID: string; Subject?: string; Body: string }; CreationDate?: string; MessageStatus?: string };

export async function syncMessages(accountId: string) {
  return log(accountId, "MESSAGES", async () => {
    const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: accountId } });
    const start = new Date(Date.now() - 30 * 86400_000).toISOString();
    const r = await ebayTrading<{ MemberMessage?: { MemberMessageExchange?: MemberMessageExchange[] } }>(accountId, "GetMemberMessages", {
      MailMessageType: "All", StartCreationTime: start, EndCreationTime: new Date().toISOString(), Pagination: { EntriesPerPage: 200, PageNumber: 1 },
    });
    let count = 0, fresh = 0;
    for (const ex of r.MemberMessage?.MemberMessageExchange ?? []) {
      const q = ex.Question;
      if (!q) continue;
      const at = ex.CreationDate ? new Date(ex.CreationDate) : new Date();
      const existing = await prisma.buyerMessageThread.findUnique({ where: { ebayAccountId_externalId: { ebayAccountId: accountId, externalId: q.MessageID } } });
      if (!existing) {
        await prisma.buyerMessageThread.create({
          data: { ebayAccountId: accountId, externalId: q.MessageID, buyerUsername: q.SenderID, subject: q.Subject || ex.Item?.Title || "Buyer question", ebayItemId: ex.Item?.ItemID, lastMessageAt: at, messages: { create: { direction: "INBOUND", body: q.Body, externalId: q.MessageID, status: "RECEIVED", sentAt: at } } },
        });
        fresh++;
      }
      count++;
    }
    if (fresh) await notify(await accountUsers(accountId, "buyer_messages"), { type: "BUYER_MESSAGE", title: `${fresh} new buyer message(s) – ${acc.name}`, link: `/ebay/messages?account=${accountId}` });
    return count;
  });
}

export async function syncReturns(accountId: string) {
  return log(accountId, "RETURNS", async () => {
    const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: accountId } });
    const token = await getAccessToken(accountId);
    const res = await fetch(`${ebayHosts(acc.environment).api}/post-order/v2/return/search?limit=200`, {
      headers: { Authorization: `IAF ${token}`, "X-EBAY-C-MARKETPLACE-ID": acc.marketplaceId, "Content-Type": "application/json" }, cache: "no-store",
    });
    if (!res.ok) throw new EbayError(`Post-Order return search failed (${res.status}): ${(await res.text()).slice(0, 300)}`, res.status);
    const j = (await res.json()) as { members?: { returnId: string; orderId?: string; buyerLoginName?: string; creationInfo?: { reason?: string; creationDate?: { value: string } }; state?: string; status?: string; buyerTotalRefund?: { estimatedRefundAmount?: { value: number; currency: string } } }[] };
    let count = 0;
    for (const m of j.members ?? []) {
      const data = { orderId: m.orderId, buyerUsername: m.buyerLoginName, reason: m.creationInfo?.reason, status: m.status || m.state || "OPEN", refundAmount: m.buyerTotalRefund?.estimatedRefundAmount ? new Prisma.Decimal(m.buyerTotalRefund.estimatedRefundAmount.value) : null, currency: m.buyerTotalRefund?.estimatedRefundAmount?.currency ?? "GBP", openedAt: new Date(m.creationInfo?.creationDate?.value ?? Date.now()) };
      await prisma.ebayReturn.upsert({ where: { ebayAccountId_returnId: { ebayAccountId: accountId, returnId: m.returnId } }, create: { ebayAccountId: accountId, returnId: m.returnId, ...data }, update: data });
      count++;
    }
    return count;
  });
}

export async function fetchPerformance(accountId: string) {
  return log(accountId, "PERFORMANCE", async () => {
    const r = await ebayRest<unknown>(accountId, "GET", "/sell/analytics/v1/seller_standards_profile");
    await prisma.ebayAccount.update({ where: { id: accountId }, data: { performance: r as Prisma.InputJsonValue, performanceAt: new Date() } });
    return 1;
  });
}

/** Loads business policies & inventory location so listings can be published. */
export async function loadPolicies(accountId: string) {
  const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: accountId } });
  const q = { marketplace_id: acc.marketplaceId };
  const [f, p, r, l] = await Promise.all([
    ebayRest<{ fulfillmentPolicies?: { fulfillmentPolicyId: string; name: string }[] }>(accountId, "GET", "/sell/account/v1/fulfillment_policy", { query: q }),
    ebayRest<{ paymentPolicies?: { paymentPolicyId: string; name: string }[] }>(accountId, "GET", "/sell/account/v1/payment_policy", { query: q }),
    ebayRest<{ returnPolicies?: { returnPolicyId: string; name: string }[] }>(accountId, "GET", "/sell/account/v1/return_policy", { query: q }),
    ebayRest<{ locations?: { merchantLocationKey: string; name?: string }[] }>(accountId, "GET", "/sell/inventory/v1/location"),
  ]);
  await prisma.ebayAccount.update({
    where: { id: accountId },
    data: {
      fulfillmentPolicyId: acc.fulfillmentPolicyId ?? f.fulfillmentPolicies?.[0]?.fulfillmentPolicyId,
      paymentPolicyId: acc.paymentPolicyId ?? p.paymentPolicies?.[0]?.paymentPolicyId,
      returnPolicyId: acc.returnPolicyId ?? r.returnPolicies?.[0]?.returnPolicyId,
      merchantLocationKey: acc.merchantLocationKey ?? l.locations?.[0]?.merchantLocationKey,
    },
  });
  return { fulfillment: f.fulfillmentPolicies ?? [], payment: p.paymentPolicies ?? [], returns: r.returnPolicies ?? [], locations: l.locations ?? [] };
}

/** Identity check used by "Test connection". */
export async function testConnection(accountId: string) {
  const r = await ebayRest<{ username?: string; userId?: string }>(accountId, "GET", "/commerce/identity/v1/user/", { host: "apiz" });
  if (r.username) await prisma.ebayAccount.update({ where: { id: accountId }, data: { ebayUsername: r.username } });
  return r;
}

export async function syncAccount(accountId: string) {
  const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (acc.isDemo) {
    await prisma.syncLog.create({ data: { ebayAccountId: accountId, kind: "ALL", status: "SKIPPED", message: "Demo account – not connected to eBay, sync skipped.", finishedAt: new Date() } });
    return { ok: true, skipped: true, results: {} };
  }
  if (acc.status !== "CONNECTED") return { ok: false, skipped: true, results: {}, error: `Account status is ${acc.status}` };
  const results = {
    orders: await syncOrders(accountId),
    listings: await syncListings(accountId),
    messages: await syncMessages(accountId),
    returns: await syncReturns(accountId),
  };
  const errors = Object.entries(results).filter(([, r]) => !r.ok).map(([k, r]) => `${k}: ${r.error}`);
  const after = await prisma.ebayAccount.findUniqueOrThrow({ where: { id: accountId } });
  await prisma.ebayAccount.update({ where: { id: accountId }, data: { lastSyncAt: new Date(), lastSyncError: errors.join(" | ") || null } });
  if (after.status === "EXPIRED" && acc.status === "CONNECTED") {
    await notify(await usersWithPermission("ebay_accounts", "manage"), { type: "EBAY_DISCONNECTED", title: `eBay account disconnected: ${acc.name}`, body: "Authorization expired – please reconnect the account.", link: `/ebay/accounts/${acc.id}` });
  }
  return { ok: errors.length === 0, skipped: false, results, error: errors.join(" | ") };
}

export async function syncAllAccounts() {
  const accounts = await prisma.ebayAccount.findMany({ where: { deletedAt: null, status: "CONNECTED", isDemo: false } });
  for (const a of accounts) await syncAccount(a.id).catch((e) => console.error("[ebay sync]", a.name, e));
  return accounts.length;
}

// ───────── Listing publishing (Sell Inventory API) ─────────

export async function publishListing(listingId: string) {
  const l = await prisma.ebayListing.findUniqueOrThrow({ where: { id: listingId }, include: { ebayAccount: true } });
  const acc = l.ebayAccount;
  if (acc.isDemo) throw new EbayError("Demo account – listings cannot be published to eBay. Connect a real (sandbox or production) account.");
  if (!acc.fulfillmentPolicyId || !acc.paymentPolicyId || !acc.returnPolicyId || !acc.merchantLocationKey)
    throw new EbayError("Business policies / inventory location are not set for this account. Use 'Load policies' on the account page first.");
  if (!l.categoryId) throw new EbayError("An eBay category ID is required to publish.");
  await prisma.ebayListing.update({ where: { id: l.id }, data: { status: "PUBLISHING", lastError: null } });
  try {
    await ebayRest(acc.id, "PUT", `/sell/inventory/v1/inventory_item/${encodeURIComponent(l.sku)}`, {
      body: {
        availability: { shipToLocationAvailability: { quantity: l.quantity } },
        condition: l.condition,
        product: { title: l.title, description: l.description ?? l.title, imageUrls: l.imageUrls, aspects: l.aspects ?? undefined },
      },
    });
    const offerBody = {
      sku: l.sku, marketplaceId: acc.marketplaceId, format: l.listingFormat, availableQuantity: l.quantity, categoryId: l.categoryId,
      listingDescription: l.description ?? l.title, listingDuration: l.listingDuration, merchantLocationKey: acc.merchantLocationKey,
      listingPolicies: { fulfillmentPolicyId: acc.fulfillmentPolicyId, paymentPolicyId: acc.paymentPolicyId, returnPolicyId: acc.returnPolicyId },
      pricingSummary: { price: { value: Number(l.price).toFixed(2), currency: l.currency } },
    };
    let offerId = l.offerId;
    if (offerId) await ebayRest(acc.id, "PUT", `/sell/inventory/v1/offer/${offerId}`, { body: offerBody });
    else offerId = (await ebayRest<{ offerId: string }>(acc.id, "POST", "/sell/inventory/v1/offer", { body: offerBody })).offerId;
    const pub = await ebayRest<{ listingId: string }>(acc.id, "POST", `/sell/inventory/v1/offer/${offerId}/publish`);
    return prisma.ebayListing.update({ where: { id: l.id }, data: { offerId, ebayItemId: pub.listingId, status: l.quantity > 0 ? "ACTIVE" : "OUT_OF_STOCK", lastPublishedAt: new Date() } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.ebayListing.update({ where: { id: l.id }, data: { status: "ERROR", lastError: msg.slice(0, 2000) } });
    await notify(await accountUsers(acc.id, "ebay_listings"), { type: "LISTING_FAILED", title: `Listing failed: ${l.sku}`, body: msg.slice(0, 200), link: `/ebay/listings/${l.id}` });
    throw e;
  }
}

export async function endListing(listingId: string) {
  const l = await prisma.ebayListing.findUniqueOrThrow({ where: { id: listingId }, include: { ebayAccount: true } });
  if (l.ebayAccount.isDemo || !l.ebayItemId) return prisma.ebayListing.update({ where: { id: l.id }, data: { status: "ENDED" } });
  if (l.offerId) await ebayRest(l.ebayAccountId, "POST", `/sell/inventory/v1/offer/${l.offerId}/withdraw`);
  else await ebayTrading(l.ebayAccountId, "EndFixedPriceItem", { ItemID: l.ebayItemId, EndingReason: "NotAvailable" });
  return prisma.ebayListing.update({ where: { id: l.id }, data: { status: "ENDED" } });
}

/** Revise price/quantity of a live listing. */
export async function reviseListing(listingId: string) {
  const l = await prisma.ebayListing.findUniqueOrThrow({ where: { id: listingId }, include: { ebayAccount: true } });
  if (l.ebayAccount.isDemo || !l.ebayItemId) return;
  if (l.offerId) {
    await ebayRest(l.ebayAccountId, "POST", "/sell/inventory/v1/bulk_update_price_quantity", {
      body: { requests: [{ sku: l.sku, shipToLocationAvailability: { quantity: l.quantity }, offers: [{ offerId: l.offerId, availableQuantity: l.quantity, price: { value: Number(l.price).toFixed(2), currency: l.currency } }] }] },
    });
  } else {
    await ebayTrading(l.ebayAccountId, "ReviseInventoryStatus", { InventoryStatus: { ItemID: l.ebayItemId, Quantity: l.quantity, StartPrice: Number(l.price).toFixed(2) } });
  }
}

/** Called after warehouse stock changes – keeps live listing quantities in step with stock. */
export async function pushListingQuantities(productId: string, qty: number) {
  const listings = await prisma.ebayListing.findMany({ where: { productId, deletedAt: null, status: { in: ["ACTIVE", "OUT_OF_STOCK"] } } });
  for (const l of listings) {
    await prisma.ebayListing.update({ where: { id: l.id }, data: { quantity: Math.max(0, qty), status: qty > 0 ? "ACTIVE" : "OUT_OF_STOCK" } });
    await reviseListing(l.id).catch(async (e) => {
      await prisma.ebayListing.update({ where: { id: l.id }, data: { lastError: `Quantity push failed: ${e instanceof Error ? e.message : e}`.slice(0, 2000) } });
    });
  }
}

export async function markDispatched(orderDbId: string, carrier: string, tracking: string) {
  const o = await prisma.ebayOrder.findUniqueOrThrow({ where: { id: orderDbId }, include: { items: true, ebayAccount: true } });
  if (!o.ebayAccount.isDemo) {
    await ebayRest(o.ebayAccountId, "POST", `/sell/fulfillment/v1/order/${o.orderId}/shipping_fulfillment`, {
      body: { lineItems: o.items.map((i) => ({ lineItemId: i.lineItemId, quantity: i.quantity })), shippedDate: new Date().toISOString(), shippingCarrierCode: carrier, trackingNumber: tracking },
    });
  }
  return prisma.ebayOrder.update({ where: { id: o.id }, data: { carrier, trackingNumber: tracking, dispatchedAt: new Date(), orderStatus: "FULFILLED" } });
}

export async function sendBuyerReply(messageId: string) {
  const m = await prisma.buyerMessage.findUniqueOrThrow({ where: { id: messageId }, include: { thread: { include: { ebayAccount: true } } } });
  const t = m.thread;
  if (t.ebayAccount.isDemo) {
    return prisma.buyerMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), error: "Demo account – reply recorded locally, not sent to eBay." } });
  }
  if (!t.ebayItemId) throw new EbayError("This conversation is not linked to an eBay item; eBay's AddMemberMessageRTQ requires an ItemID.");
  try {
    await ebayTrading(t.ebayAccountId, "AddMemberMessageRTQ", { ItemID: t.ebayItemId, MemberMessage: { Body: m.body, ParentMessageID: t.externalId, RecipientID: t.buyerUsername } });
    return prisma.buyerMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), error: null } });
  } catch (e) {
    await prisma.buyerMessage.update({ where: { id: m.id }, data: { status: "FAILED", error: (e instanceof Error ? e.message : String(e)).slice(0, 1000) } });
    throw e;
  }
}

// helpers
async function accountUsers(accountId: string, module: "ebay_orders" | "buyer_messages" | "ebay_listings") {
  const managers = await usersWithPermission("ebay_accounts", "manage");
  const assigned = (await prisma.ebayAccountAssignment.findMany({ where: { ebayAccountId: accountId } })).map((a) => a.userId);
  const withModule = new Set(await usersWithPermission(module, "view"));
  return [...new Set([...managers, ...assigned.filter((id) => withModule.has(id))])];
}

let sysId: string | null = null;
async function systemUserId(tx: Prisma.TransactionClient) {
  if (sysId) return sysId;
  const u = await tx.user.findFirstOrThrow({ where: { role: { key: "super_admin" } }, orderBy: { createdAt: "asc" } });
  return (sysId = u.id);
}
