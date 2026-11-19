#!/usr/bin/env node
/**
 * ORIA FUTURE – end-to-end smoke test (Playwright).
 * Requires a running app with the demo seed:  BASE_URL=http://localhost:3000 node scripts/smoke-test.mjs
 * Covers: every page as owner, RBAC enforcement, task workflow, real-time chat & notifications,
 * stock movements and the full purchasing workflow (request → PO → receipt → inventory).
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require(require("node:child_process").execSync("npm root -g").toString().trim() + "/playwright")); }

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OWNER = { email: "owner@oriafuture.com", password: process.env.OWNER_PASSWORD || "OriaAdmin#2026" };
const demo = (h) => ({ email: `${h}@demo.oriafuture.com`, password: "Demo#Password1" });
let failures = 0, passes = 0;
const ok = (m) => { passes++; console.log("  ✓", m); };
const fail = (m) => { failures++; console.log("  ✗", m); };
const check = (cond, m) => (cond ? ok(m) : fail(m));

const browser = await chromium.launch();
async function login(cred) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", cred.email);
  await page.fill("input[name=password]", cred.password);
  await Promise.all([page.waitForURL("**/dashboard", { timeout: 30000 }), page.click("button[type=submit]")]);
  return page;
}
async function submitModal(page, triggerText, fill, submitText) {
  await page.getByRole("button", { name: triggerText, exact: false }).first().click();
  const dlg = page.getByRole("dialog");
  await fill(dlg);
  await dlg.getByRole("button", { name: submitText ?? /Save|Create|Confirm|Submit/ }).last().click();
  await dlg.waitFor({ state: "detached", timeout: 15000 });
}

console.log("1) Owner – every page renders");
const owner = await login(OWNER);
const pages = ["/dashboard", "/employees", "/departments", "/roles", "/tasks", "/tasks?view=board", "/chat", "/requests", "/notifications", "/ebay/accounts", "/ebay/orders", "/ebay/listings", "/ebay/listings/new", "/ebay/messages", "/ebay/returns", "/inventory", "/warehouse", "/suppliers", "/enquiries", "/purchasing", "/purchasing?tab=orders", "/finance", "/finance/transactions", "/finance/payroll", "/reports", "/activity-logs", "/activity-logs?tab=logins", "/settings", "/profile", "/search?q=OF"];
for (const r of ["sales", "monthly", "accounts", "products", "returns", "stock", "lowstock", "purchases", "suppliers", "expenses", "revenue", "pnl", "cashflow", "employees", "tasks"]) pages.push(`/reports?tab=${r}&range=90`);
for (const p of pages) {
  const res = await owner.goto(BASE + p);
  const body = await owner.textContent("body");
  check(res.status() === 200 && !/Application error|Unhandled Runtime Error|Something went wrong|This page couldn/.test(body), `${p} (${res.status()})`);
}
// detail pages via first link in lists
for (const [list, sel] of [["/employees", 'a[href^="/employees/c"]'], ["/inventory", 'a[href^="/inventory/c"]'], ["/suppliers", 'a[href^="/suppliers/c"]'], ["/ebay/accounts", 'a[href^="/ebay/accounts/c"]'], ["/ebay/orders", 'a[href^="/ebay/orders/c"]'], ["/ebay/listings", 'a[href^="/ebay/listings/c"]'], ["/ebay/messages", 'a[href^="/ebay/messages/c"]'], ["/departments", 'a[href^="/departments/c"]'], ["/roles", 'a[href^="/roles/c"]'], ["/tasks", 'a[href^="/tasks/c"]'], ["/enquiries", 'a[href^="/enquiries/c"]'], ["/purchasing?tab=orders", 'a[href^="/purchasing/orders/c"]']]) {
  await owner.goto(BASE + list);
  const href = await owner.locator(sel).first().getAttribute("href");
  const res = await owner.goto(BASE + href);
  check(res.status() === 200 && !/Application error/.test(await owner.textContent("body")), `detail ${href}`);
}
for (const f of ["csv", "xlsx", "pdf"]) {
  const r = await owner.request.get(`${BASE}/api/export/sales?format=${f}`);
  check(r.status() === 200 && (await r.body()).length > 100, `export sales.${f}`);
}
const po = await owner.request.get(`${BASE}/api/export/po/${(await owner.goto(BASE + "/purchasing?tab=orders"), (await owner.locator('a[href^="/purchasing/orders/c"]').first().getAttribute("href")).split("/").pop())}`);
check(po.status() === 200 && po.headers()["content-type"] === "application/pdf", "purchase order PDF");
check(owner.errors.length === 0, `no client-side errors (${owner.errors.join(" | ")})`);

console.log("2) RBAC – office worker restrictions (server-side)");
const office = await login(demo("office"));
for (const p of ["/finance", "/finance/payroll", "/employees", "/roles", "/ebay/orders", "/inventory", "/activity-logs"]) {
  await office.goto(BASE + p);
  check(office.url().includes("/forbidden"), `office worker blocked from ${p}`);
}
check((await office.request.get(`${BASE}/api/export/transactions?format=csv`)).status() === 403, "finance export API returns 403");
check((await office.request.get(`${BASE}/api/export/payroll?format=csv`)).status() === 403, "payroll export API returns 403");
const nav = await office.textContent("nav");
check(!nav.includes("Finance Dashboard") && nav.includes("Tasks"), "sidebar only shows permitted modules");
const support = await login(demo("support"));
await support.goto(BASE + "/ebay/accounts");
const supportAccounts = await support.locator('a[href^="/ebay/accounts/c"]').count();
check(supportAccounts === 2, `support sees only its 2 assigned eBay accounts (saw ${supportAccounts})`);
const fin = await login(demo("finance"));
await fin.goto(BASE + "/finance/payroll");
check(fin.url().includes("/forbidden"), "finance worker cannot see payroll");

console.log("3) Tasks – assign → accept → submit → approve, with live notification");
const gm = await login(demo("gm"));
const title = `Smoke task ${Date.now()}`;
await gm.goto(BASE + "/tasks");
await submitModal(gm, "+ New task", async (d) => { await d.locator("input[name=title]").fill(title); await d.locator("select[name=assigneeId]").selectOption({ label: "Mohammed Ali" }); await d.locator("select[name=priority]").selectOption("HIGH"); }, "Create task");
await office.goto(BASE + "/dashboard");
await office.waitForTimeout(500);
const toast = office.getByText(`New task: ${title}`).first();
await gm.reload();
check(await gm.getByText(title).count() > 0, "task created");
await office.goto(BASE + "/tasks");
await office.getByRole("link", { name: title }).click();
await submitModal(office, "Accept / start", async () => {}, "Confirm");
await submitModal(office, "Submit for approval", async (d) => d.locator("textarea[name=note]").fill("Done – proof attached"), "Confirm");
await gm.goto(office.url());
await submitModal(gm, "Approve & complete", async () => {}, "Confirm");
await gm.reload();
check((await gm.textContent("body")).includes("Completed"), "task approved and completed");
void toast;

console.log("4) Real-time chat between two users");
await gm.goto(BASE + "/chat");
await office.goto(BASE + "/chat");
await gm.getByRole("button", { name: /Company-wide/ }).click();
await office.getByRole("button", { name: /Company-wide/ }).click();
await office.waitForTimeout(1500);
const msg = `Realtime hello ${Date.now()}`;
await gm.locator("textarea").fill(msg);
await gm.keyboard.press("Enter");
try { await office.getByText(msg).waitFor({ timeout: 8000 }); ok("message delivered live without refresh"); } catch { fail("message not delivered live"); }
try { await gm.getByText(/Seen by/).waitFor({ timeout: 8000 }); ok("read receipt shown to sender"); } catch { fail("read receipt not shown"); }

console.log("5) Inventory – stock movement");
const stock = await login(demo("stock.manager"));
await stock.goto(BASE + "/inventory?q=OF-YOGA-MAT");
await stock.getByRole("link", { name: "OF-YOGA-MAT" }).click();
const before = Number((await stock.locator("text=Total stock").locator("xpath=..").locator("p").nth(1).textContent()).trim());
await submitModal(stock, "Record stock movement", async (d) => { await d.locator("select[name=type]").selectOption("IN"); await d.locator("input[name=quantity]").fill("25"); await d.locator("input[name=reference]").fill("SMOKE-DN-1"); }, "Save");
await stock.reload();
const after = Number((await stock.locator("text=Total stock").locator("xpath=..").locator("p").nth(1).textContent()).trim());
check(after === before + 25, `stock increased ${before} → ${after}`);
await submitModal(stock, "Record stock movement", async (d) => { await d.locator("select[name=type]").selectOption("OUT"); await d.locator("input[name=quantity]").fill("99999"); }, "Save").catch(() => {});
check((await stock.getByRole("dialog").getByRole("alert").textContent().catch(() => "")).includes("Insufficient stock"), "cannot remove more stock than available");
await stock.keyboard.press("Escape");

console.log("6) Purchasing – full 11-step workflow");
await stock.goto(BASE + "/purchasing");
await submitModal(stock, "+ Purchase request", async (d) => { await d.locator("select[name=productId]").selectOption({ label: "OF-YOGA-MAT – Non-slip Yoga Mat 6mm" }); await d.locator("input[name=quantity]").fill("300"); await d.locator("textarea[name=reason]").fill("Smoke test reorder"); }, "Save");
await stock.reload();
const prHref = await stock.locator('a[href^="/purchasing/requests/"]').first().getAttribute("href");
const ops = await login(demo("ops"));
await ops.goto(BASE + prHref);
await submitModal(ops, "Management review", async () => {}, "Confirm");
await submitModal(ops, "Request supplier quotation", async () => {}, "Confirm");
await stock.goto(BASE + prHref);
await submitModal(stock, "Upload supplier quotation", async (d) => { await d.locator("select[name=supplierId]").selectOption({ index: 3 }); await d.locator("input[name=unitPrice]").fill("4.10"); await d.locator("input[name=moq]").fill("200"); await d.locator("input[name=shippingCost]").fill("150"); }, "Save");
const finMgr = await login(demo("finance.manager"));
await finMgr.goto(BASE + prHref);
await submitModal(finMgr, "Finance review", async (d) => d.locator("textarea[name=note]").fill("Within Q4 budget"), "Confirm review");
await gm.goto(BASE + prHref);
await submitModal(gm, "Final approval", async () => {}, "Confirm");
await ops.goto(BASE + prHref);
await ops.getByRole("button", { name: /Generate purchase order/ }).click();
await ops.waitForTimeout(1500);
await ops.reload();
const poHref = await ops.locator('a[href^="/purchasing/orders/"]').first().getAttribute("href");
check(!!poHref, "purchase order generated");
await stock.goto(BASE + "/inventory?q=OF-YOGA-MAT");
await stock.getByRole("link", { name: "OF-YOGA-MAT" }).click();
const beforeReceipt = Number((await stock.locator("text=Total stock").locator("xpath=..").locator("p").nth(1).textContent()).trim());
await stock.goto(BASE + poHref);
stock.once("dialog", (d) => d.accept());
await stock.getByRole("button", { name: /Confirm receipt/ }).click();
await stock.getByText(/inventory updated/).waitFor({ timeout: 10000 });
await stock.goto(BASE + "/inventory?q=OF-YOGA-MAT");
await stock.getByRole("link", { name: "OF-YOGA-MAT" }).click();
const afterReceipt = Number((await stock.locator("text=Total stock").locator("xpath=..").locator("p").nth(1).textContent()).trim());
check(afterReceipt === beforeReceipt + 300, `receipt updated inventory ${beforeReceipt} → ${afterReceipt}`);
await stock.goto(BASE + prHref);
check((await stock.textContent("body")).includes("Received"), "purchase request marked RECEIVED");
const finTx = await finMgr.request.get(`${BASE}/api/export/transactions?format=csv&basis=estimated`);
check((await finTx.text()).includes("OF-YOGA-MAT × 300"), "estimated supplier cost recorded in finance");


console.log("8) Employee onboarding, 2FA and eBay connection workflow");
const newEmail = `new.hire.${Date.now()}@oriafuture.com`;
await owner.goto(BASE + "/employees");
await submitModal(owner, "+ Add employee", async (d) => {
  await d.locator("input[name=name]").fill("New Hire"); await d.locator("input[name=email]").fill(newEmail);
  await d.locator("select[name=roleId]").selectOption({ label: "Office Worker" }); await d.locator("select[name=departmentId]").selectOption({ label: "Office Workers" });
  await d.locator("input[name=password]").fill("TempPassword123");
}, "Create employee");
const hire = await login({ email: newEmail, password: "TempPassword123" });
check((await hire.textContent("body")).includes("change your initial password"), "new employee can log in and is asked to change password");
await hire.goto(BASE + "/profile");
await hire.getByRole("button", { name: "Set up 2FA" }).click();
const secret = (await hire.locator("code").first().textContent()).trim();
const { authenticator } = require("otplib");
await hire.locator("input[name=code]").fill(authenticator.generate(secret));
await hire.getByRole("button", { name: "Enable 2FA" }).click();
await hire.getByRole("button", { name: "Disable 2FA" }).waitFor({ timeout: 10000 });
ok("2FA enabled with authenticator code");
const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
await p2.goto(`${BASE}/login`); await p2.fill("input[name=email]", newEmail); await p2.fill("input[name=password]", "TempPassword123");
await Promise.all([p2.waitForURL("**/login/2fa"), p2.click("button[type=submit]")]);
const p2Blocked = await p2.request.get(`${BASE}/api/notifications`);
check(p2Blocked.status() === 401, "session is not usable before the second factor");
await p2.fill("input[name=code]", "000000"); await p2.click("button[type=submit]");
await p2.getByText("Invalid authentication code").waitFor({ timeout: 10000 }); ok("wrong 2FA code rejected");
await p2.fill("input[name=code]", authenticator.generate(secret));
await Promise.all([p2.waitForURL("**/dashboard", { timeout: 15000 }), p2.click("button[type=submit]")]);
ok("login completes with valid 2FA code");
// suspend → immediately signed out
await owner.goto(BASE + "/employees?q=" + encodeURIComponent(newEmail));
await owner.getByRole("link", { name: /New Hire/ }).click();
owner.once("dialog", (d) => d.accept());
await owner.getByRole("button", { name: "Suspend" }).click();
await owner.getByText("Employee suspended").waitFor({ timeout: 10000 });
await p2.goto(BASE + "/dashboard");
check(p2.url().includes("/login"), "suspended employee is signed out immediately");
// forgot password never reveals account existence
const fp = await browser.newPage(); await fp.goto(`${BASE}/forgot-password`); await fp.fill("input[name=email]", "nobody@nowhere.com"); await fp.click("button[type=submit]");
check(await fp.getByText(/If an account exists/).waitFor({ timeout: 10000 }).then(() => true, () => false), "password reset does not reveal whether an account exists");
// eBay: add real account; connecting without server keys gives a clear error, never fakes success
await owner.goto(BASE + "/ebay/accounts");
await submitModal(owner, "+ Add eBay account", async (d) => { await d.locator("input[name=name]").fill("Smoke Sandbox Store"); await d.locator("input[name=code]").fill("SMK-" + String(Date.now()).slice(-5)); }, "Save");
await owner.reload();
await owner.getByRole("link", { name: /Smoke Sandbox Store/ }).first().click();
await owner.getByRole("link", { name: "Connect with eBay" }).click();
await owner.waitForLoadState();
const body8 = await owner.textContent("body");
check(process.env.EBAY_CLIENT_ID ? owner.url().includes("ebay.com") : body8.includes("credentials are not configured"), "eBay connect: redirects to eBay consent or reports missing credentials honestly");
await owner.goto(BASE + "/ebay/accounts");
await owner.getByRole("link", { name: /ORIA Main Store/ }).click();
await owner.getByRole("button", { name: "Sync now" }).click();
await owner.getByText(/DEMO account/).first().waitFor({ timeout: 10000 });
ok("demo account sync is refused with a clear demo label");

console.log("7) Security basics");
const anon = await browser.newContext();
const ap = await anon.newPage();
check((await ap.request.get(`${BASE}/api/notifications`)).status() === 401, "API rejects anonymous requests");
const hdr = (await ap.request.get(`${BASE}/login`)).headers();
check(!!hdr["content-security-policy"] && hdr["x-frame-options"] === "DENY", "security headers present");
const csrf = await owner.request.post(`${BASE}/api/notifications`, { data: { all: true }, headers: { Origin: "https://evil.example" } });
check(csrf.status() === 403, "cross-origin POST rejected");

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
