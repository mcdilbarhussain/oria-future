"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPerm, canAccessEbayAccount, requireUser, type CurrentUser } from "@/lib/auth";
import { run, zs, formToObject, UserError, type ActionResult } from "@/lib/action";
import { audit } from "@/lib/audit";
import { notify, notifyPermission } from "@/lib/notify";
import { saveUpload } from "@/lib/storage";
import { revokeLocalTokens } from "@/lib/ebay/oauth";
import { syncAccount, testConnection, loadPolicies, fetchPerformance, publishListing, endListing, reviseListing, markDispatched, sendBuyerReply } from "@/lib/ebay/sync";

function guardAccount(u: CurrentUser, accountId: string) {
  if (!canAccessEbayAccount(u, accountId)) throw new UserError("You are not assigned to this eBay account.");
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ───────── Accounts ─────────
export async function createEbayAccount(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("ebay_accounts", "manage");
    const d = z.object({ name: zs.str(100), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,20}$/), environment: z.enum(["SANDBOX", "PRODUCTION"]), marketplaceId: z.enum(["EBAY_GB", "EBAY_US", "EBAY_DE", "EBAY_FR", "EBAY_IT", "EBAY_ES", "EBAY_AU", "EBAY_IE"]), notes: zs.optStr(1000) }).parse(formToObject(fd));
    const a = await prisma.ebayAccount.create({ data: d });
    await audit({ userId: u.id, module: "ebay_accounts", action: "create", entity: "EbayAccount", entityId: a.id, summary: `added eBay account ${d.name} (${d.environment})` });
    revalidatePath("/ebay/accounts");
    return { ok: true, message: "Account added – click Connect to authorise it with eBay." };
  });
}

export async function updateEbayAccount(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("ebay_accounts", "manage");
    const id = String(fd.get("id"));
    const d = z.object({ name: zs.str(100), notes: zs.optStr(1000), fulfillmentPolicyId: zs.optStr(40), paymentPolicyId: zs.optStr(40), returnPolicyId: zs.optStr(40), merchantLocationKey: zs.optStr(60) }).parse(formToObject(fd));
    await prisma.ebayAccount.update({ where: { id }, data: d });
    await audit({ userId: u.id, module: "ebay_accounts", action: "update", entity: "EbayAccount", entityId: id, summary: `updated eBay account settings ${d.name}` });
    revalidatePath(`/ebay/accounts/${id}`);
    return { ok: true, message: "Saved." };
  });
}

export async function disconnectEbayAccount(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("ebay_accounts", "manage");
    const id = String(fd.get("id"));
    await revokeLocalTokens(id);
    const a = await prisma.ebayAccount.findUniqueOrThrow({ where: { id } });
    await audit({ userId: u.id, module: "ebay_accounts", action: "disconnect", entity: "EbayAccount", entityId: id, summary: `disconnected eBay account ${a.name} (tokens deleted)` });
    await notifyPermission("ebay_accounts", "manage", { type: "EBAY_DISCONNECTED", title: `eBay account disconnected: ${a.name}`, body: `by ${u.name}`, link: `/ebay/accounts/${id}` }, u.id);
    revalidatePath(`/ebay/accounts/${id}`);
    return { ok: true, message: "Disconnected. Stored tokens were deleted. To fully revoke, also remove the app under eBay → Account settings → Third-party app access." };
  });
}

export async function ebayAccountOp(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await requireUser();
    const id = String(fd.get("id"));
    const op = z.enum(["sync", "test", "policies", "performance"]).parse(fd.get("op"));
    if (!u.can("ebay_accounts", op === "sync" ? "edit" : "manage") && !(op === "sync" && u.can("ebay_orders", "edit"))) throw new UserError("Not authorised.");
    guardAccount(u, id);
    const acc = await prisma.ebayAccount.findUniqueOrThrow({ where: { id } });
    if (acc.isDemo) return { ok: false, error: "This is a DEMO account with sample data – it is not connected to eBay. Add and connect a real account to use the eBay APIs." };
    try {
      let message = "";
      if (op === "sync") { const r = await syncAccount(id); message = r.ok ? "Synchronisation complete." : `Sync finished with errors: ${r.error}`; if (!r.ok) return { ok: false, error: message }; }
      if (op === "test") { const r = await testConnection(id); message = `Connected as eBay user ${r.username ?? r.userId}.`; }
      if (op === "policies") { const r = await loadPolicies(id); message = `Loaded ${r.fulfillment.length} fulfilment, ${r.payment.length} payment, ${r.returns.length} return policies and ${r.locations.length} locations.`; }
      if (op === "performance") { const r = await fetchPerformance(id); if (!r.ok) return { ok: false, error: r.error! }; message = "Performance data refreshed."; }
      await audit({ userId: u.id, module: "ebay_accounts", action: op, entity: "EbayAccount", entityId: id, summary: `${op} on ${acc.name}: ${message}` });
      revalidatePath(`/ebay/accounts/${id}`);
      return { ok: true, message };
    } catch (e) { return { ok: false, error: msg(e) }; }
  });
}

// ───────── Orders ─────────
export async function dispatchOrder(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("ebay_orders", "edit");
    const id = String(fd.get("id"));
    const d = z.object({ carrier: zs.str(60), tracking: zs.str(60) }).parse(formToObject(fd));
    const o = await prisma.ebayOrder.findUniqueOrThrow({ where: { id } });
    guardAccount(u, o.ebayAccountId);
    try { await markDispatched(id, d.carrier, d.tracking); } catch (e) { return { ok: false, error: msg(e) }; }
    await audit({ userId: u.id, module: "ebay_orders", action: "dispatch", entity: "EbayOrder", entityId: id, summary: `marked order ${o.orderId} dispatched (${d.carrier} ${d.tracking})` });
    revalidatePath(`/ebay/orders/${id}`);
    return { ok: true, message: "Order marked as dispatched." };
  });
}

// ───────── Listings ─────────
const listingSchema = z.object({
  ebayAccountId: zs.str(), productId: zs.optStr(40), sku: z.string().trim().min(1).max(50), title: z.string().trim().min(1).max(80, "eBay titles are limited to 80 characters"), description: zs.optStr(50000),
  categoryId: zs.optStr(20), condition: z.enum(["NEW", "LIKE_NEW", "NEW_OTHER", "USED_EXCELLENT", "USED_GOOD", "FOR_PARTS_OR_NOT_WORKING"]), price: zs.money(), quantity: zs.int(0),
  listingDuration: z.enum(["GTC", "DAYS_30", "DAYS_10", "DAYS_7"]), imageUrls: z.string().optional().transform((v) => (v ? v.split(/\s+/).map((s) => s.trim()).filter((s) => /^https:\/\//.test(s)) : [])),
  aspects: z.string().optional().transform((v, ctx) => {
    if (!v?.trim()) return null;
    const out: Record<string, string[]> = {};
    for (const line of v.split("\n")) { const [k, ...rest] = line.split(":"); if (!k?.trim() || !rest.length) { ctx.addIssue({ code: "custom", message: `Item specific "${line}" must be "Name: value"` }); continue; } out[k.trim()] = rest.join(":").split(",").map((x) => x.trim()).filter(Boolean); }
    return out;
  }),
});

export async function saveListing(_: unknown, fd: FormData): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const id = fd.get("id") ? String(fd.get("id")) : null;
    const u = await assertPerm("ebay_listings", id ? "edit" : "create");
    const d = listingSchema.parse(formToObject(fd));
    guardAccount(u, d.ebayAccountId);
    const base = process.env.APP_URL || "";
    for (const f of fd.getAll("images")) {
      if (f instanceof File && f.size) { const a = await saveUpload(f, u.id, "listing-image"); if (a) d.imageUrls.push(`${base}/api/listing-images/${a.id}`); }
    }
    const data = { ...d, aspects: d.aspects ?? Prisma.JsonNull, updatedById: u.id };
    let listing;
    if (id) {
      const before = await prisma.ebayListing.findUniqueOrThrow({ where: { id } });
      guardAccount(u, before.ebayAccountId);
      listing = await prisma.ebayListing.update({ where: { id }, data: { ...data, imageUrls: [...new Set([...(fd.get("keepImages") ? before.imageUrls : []), ...d.imageUrls])] } });
      await audit({ userId: u.id, module: "ebay_listings", action: "update", entity: "EbayListing", entityId: id, summary: `updated listing ${d.sku}`, before: { title: before.title, price: before.price, quantity: before.quantity }, after: { title: d.title, price: d.price, quantity: d.quantity } });
      if (["ACTIVE", "OUT_OF_STOCK"].includes(before.status) && (Number(before.price) !== d.price || before.quantity !== d.quantity)) {
        try { await reviseListing(id); } catch (e) { await prisma.ebayListing.update({ where: { id }, data: { lastError: msg(e) } }); return { ok: false, error: `Saved locally but eBay revise failed: ${msg(e)}` }; }
      }
    } else {
      listing = await prisma.ebayListing.create({ data: { ...data, createdById: u.id, status: "DRAFT" } });
      await audit({ userId: u.id, module: "ebay_listings", action: "create", entity: "EbayListing", entityId: listing.id, summary: `created draft listing ${d.sku}` });
    }
    revalidatePath("/ebay/listings");
    return { ok: true, message: "Listing saved.", data: { id: listing.id } };
  });
}

export async function listingOp(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const id = String(fd.get("id"));
    const op = z.enum(["publish", "end", "delete"]).parse(fd.get("op"));
    const u = await assertPerm("ebay_listings", op === "delete" ? "delete" : "edit");
    const l = await prisma.ebayListing.findUniqueOrThrow({ where: { id } });
    guardAccount(u, l.ebayAccountId);
    try {
      if (op === "publish") await publishListing(id);
      if (op === "end") await endListing(id);
      if (op === "delete") { if (["ACTIVE", "OUT_OF_STOCK"].includes(l.status)) throw new UserError("End the listing on eBay before deleting it."); await prisma.ebayListing.update({ where: { id }, data: { deletedAt: new Date() } }); }
    } catch (e) { if (e instanceof UserError) throw e; return { ok: false, error: msg(e) }; }
    await audit({ userId: u.id, module: "ebay_listings", action: op, entity: "EbayListing", entityId: id, summary: `${op} listing ${l.sku}` });
    revalidatePath(`/ebay/listings/${id}`); revalidatePath("/ebay/listings");
    return { ok: true, message: op === "publish" ? "Published to eBay." : op === "end" ? "Listing ended." : "Deleted." };
  });
}

// ───────── Buyer messages ─────────
async function loadThread(u: CurrentUser, id: string) {
  const t = await prisma.buyerMessageThread.findUniqueOrThrow({ where: { id } });
  guardAccount(u, t.ebayAccountId);
  return t;
}

export async function assignThread(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("buyer_messages", "edit");
    const t = await loadThread(u, String(fd.get("id")));
    const assignedToId = String(fd.get("assignedToId") || "") || null;
    const important = fd.get("important") === "on";
    await prisma.buyerMessageThread.update({ where: { id: t.id }, data: { assignedToId, important, status: assignedToId && t.status === "NEW" ? "ASSIGNED" : undefined } });
    if (assignedToId && assignedToId !== t.assignedToId) await notify([assignedToId], { type: "BUYER_MESSAGE", title: `Buyer message assigned to you: ${t.subject}`, body: `from ${t.buyerUsername}`, link: `/ebay/messages/${t.id}` });
    revalidatePath(`/ebay/messages/${t.id}`);
    return { ok: true, message: "Updated." };
  });
}

export async function addNote(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("buyer_messages", "view");
    const t = await loadThread(u, String(fd.get("id")));
    await prisma.conversationNote.create({ data: { threadId: t.id, userId: u.id, body: zs.str(3000).parse(fd.get("body")) } });
    revalidatePath(`/ebay/messages/${t.id}`);
    return { ok: true };
  });
}

/** Prepare a reply. "send" goes straight to eBay unless the conversation is flagged important (then management review is required). */
export async function replyToBuyer(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("buyer_messages", "create");
    const t = await loadThread(u, String(fd.get("id")));
    const body = zs.str(2000).parse(fd.get("body")).replace(/\{buyer\}/g, t.buyerUsername);
    const mode = z.enum(["draft", "send"]).parse(fd.get("mode"));
    const needsReview = t.important && !u.can("buyer_messages", "approve");
    const canSend = u.can("buyer_messages", "edit") && !needsReview;
    const status = mode === "draft" ? "DRAFT" : canSend ? "DRAFT" : "PENDING_REVIEW";
    const m = await prisma.buyerMessage.create({ data: { threadId: t.id, direction: "OUTBOUND", body, status, authorId: u.id } });
    if (mode === "send" && canSend) {
      try { await sendBuyerReply(m.id); } catch (e) { revalidatePath(`/ebay/messages/${t.id}`); return { ok: false, error: `Reply saved but sending failed: ${msg(e)}` }; }
      await prisma.buyerMessageThread.update({ where: { id: t.id }, data: { status: "REPLIED", unread: false, lastMessageAt: new Date() } });
      await audit({ userId: u.id, module: "buyer_messages", action: "send", entity: "BuyerMessageThread", entityId: t.id, summary: `replied to buyer ${t.buyerUsername}` });
    } else if (status === "PENDING_REVIEW") {
      await prisma.buyerMessageThread.update({ where: { id: t.id }, data: { status: "AWAITING_REVIEW" } });
      await notifyPermission("buyer_messages", "approve", { type: "BUYER_MESSAGE", title: `Reply awaiting review: ${t.subject}`, body: body.slice(0, 140), link: `/ebay/messages/${t.id}` }, u.id);
    }
    revalidatePath(`/ebay/messages/${t.id}`);
    return { ok: true, message: mode === "draft" ? "Draft saved." : status === "PENDING_REVIEW" ? "Submitted for management review (important conversation)." : "Reply sent." };
  });
}

export async function reviewReply(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("buyer_messages", "approve");
    const m = await prisma.buyerMessage.findUniqueOrThrow({ where: { id: String(fd.get("messageId")) }, include: { thread: true } });
    guardAccount(u, m.thread.ebayAccountId);
    const decision = z.enum(["approve", "reject", "send"]).parse(fd.get("decision"));
    if (decision === "reject") {
      await prisma.buyerMessage.update({ where: { id: m.id }, data: { status: "DRAFT", reviewedById: u.id, error: String(fd.get("note") || "Returned for changes") } });
      if (m.authorId) await notify([m.authorId], { type: "BUYER_MESSAGE", title: `Reply returned for changes: ${m.thread.subject}`, link: `/ebay/messages/${m.threadId}` });
    } else {
      await prisma.buyerMessage.update({ where: { id: m.id }, data: { reviewedById: u.id } });
      try { await sendBuyerReply(m.id); } catch (e) { return { ok: false, error: msg(e) }; }
      await prisma.buyerMessageThread.update({ where: { id: m.threadId }, data: { status: "REPLIED", unread: false, lastMessageAt: new Date() } });
    }
    await audit({ userId: u.id, module: "buyer_messages", action: `review_${decision}`, entity: "BuyerMessage", entityId: m.id, summary: `${decision} reply to ${m.thread.buyerUsername}` });
    revalidatePath(`/ebay/messages/${m.threadId}`);
    return { ok: true };
  });
}

export async function setThreadStatus(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("buyer_messages", "edit");
    const t = await loadThread(u, String(fd.get("id")));
    const status = z.enum(["CLOSED", "ASSIGNED", "NEW"]).parse(fd.get("status"));
    await prisma.buyerMessageThread.update({ where: { id: t.id }, data: { status, unread: false } });
    revalidatePath(`/ebay/messages/${t.id}`);
    return { ok: true };
  });
}

export async function saveTemplate(_: unknown, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPerm("buyer_messages", "create");
    const d = z.object({ name: zs.str(80), category: zs.optStr(40), body: zs.str(2000) }).parse(formToObject(fd));
    await prisma.replyTemplate.create({ data: { ...d, createdById: u.id } });
    revalidatePath("/ebay/messages");
    return { ok: true, message: "Template saved." };
  });
}
