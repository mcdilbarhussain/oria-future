# eBay integration – setup & verification guide

> **Honest status:** the integration is written against eBay's public API documentation (official APIs only, no scraping). It has **not** been run against eBay yet, because no application keys were available and the build environment had no network access to eBay. Follow the sandbox checklist below before connecting a live seller account.

## 1. APIs used
| Feature | Official API / call | OAuth scope |
|---|---|---|
| Connect account (consent) | OAuth 2.0 Authorization Code Grant (`auth.ebay.com/oauth2/authorize`, `/identity/v1/oauth2/token`) | – |
| Identify connected user | Commerce Identity API `GET /commerce/identity/v1/user/` | `commerce.identity.readonly` |
| Orders sync, payment and fulfilment status, refunds | Sell **Fulfillment** API `GET /sell/fulfillment/v1/order` | `sell.fulfillment` |
| Mark dispatched + tracking | Fulfillment API `POST /order/{id}/shipping_fulfillment` | `sell.fulfillment` |
| Listings sync (active / unsold, incl. listings created on eBay.co.uk) | **Trading** API `GetMyeBaySelling` (OAuth token via `X-EBAY-API-IAF-TOKEN`) | `api_scope` |
| Create / publish / revise listings | Sell **Inventory** API `inventory_item`, `offer`, `offer/{id}/publish`, `bulk_update_price_quantity` | `sell.inventory` |
| Revise or end listings not created via the Inventory API | Trading `ReviseInventoryStatus`, `EndFixedPriceItem` | `api_scope` |
| Business policies & locations | Sell **Account** API `fulfillment_policy`, `payment_policy`, `return_policy`; Inventory `location` | `sell.account`, `sell.inventory` |
| Buyer messages (questions about items) | Trading `GetMemberMessages`, reply with `AddMemberMessageRTQ` | `api_scope` |
| Returns | **Post-Order** API `GET /post-order/v2/return/search` | `api_scope` |
| Account performance | Sell **Analytics** API `GET /sell/analytics/v1/seller_standards_profile` | `sell.analytics.readonly` |
| Marketplace account deletion (required for production keys) | Notification endpoint `/api/ebay/account-deletion` | – |

**Known API limitations (eBay's, not the app's)**
* Listings created on the eBay website are not visible to the Inventory API. The app syncs them with the Trading API and revises them with `ReviseInventoryStatus`. To edit them fully with the Inventory API, migrate them with `bulk_migrate_listing` (not automated here).
* Buyer messaging: the Trading API exposes buyer *questions about items* (`GetMemberMessages`), and replies must reference an item ID. Order-level messages that are not about an item may not be available. eBay is moving messaging to newer APIs, so check the current docs.
* Buyer personal data is limited to what the Fulfillment API returns for your scopes and the buyer's region.
* The Post-Order API is older and accepts OAuth user tokens with the `IAF` prefix. Verify this in the sandbox.
* Fees: `totalMarketplaceFee` appears on orders once eBay calculates it. For exact payout reconciliation, add the Sell **Finances** API (`sell.finances` scope is already requested).

## 2. Developer account & keys
1. Create a developer account at https://developer.ebay.com and open **Application Keys**.
2. Create a **Sandbox** keyset first (later also Production). Note the **App ID (Client ID)**, **Dev ID** and **Cert ID (Client Secret)**.
3. Open **User Tokens → Get a Token from eBay via Your Application → Add eBay Redirect URL**. This creates a **RuName**. Set:
   * *Auth accepted URL*: `https://YOUR-DOMAIN/api/ebay/oauth/callback`
   * *Auth declined URL*: `https://YOUR-DOMAIN/api/ebay/oauth/callback`
   * *Privacy policy URL*: your company privacy page.
   * eBay requires HTTPS for these URLs. For local testing, use a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and set `APP_URL` to the tunnel URL.
4. Put the keys in the server's `.env`. Never put them in front-end code:
   ```
   EBAY_ENVIRONMENT=SANDBOX
   EBAY_CLIENT_ID=...
   EBAY_CLIENT_SECRET=...
   EBAY_DEV_ID=...
   EBAY_RUNAME=Your_Name-YourApp-SBX-abc123   # the RuName string, not the URL
   EBAY_MARKETPLACE_ID=EBAY_GB
   ```
5. **Production only:** under *Alerts & Notifications*, subscribe to *Marketplace Account Deletion* with endpoint `https://YOUR-DOMAIN/api/ebay/account-deletion`. Set a verification token (32–80 characters) and put it in `EBAY_VERIFICATION_TOKEN`. eBay will not activate a production keyset without this step, or an approved exemption.

## 3. Sandbox test checklist (do this before going live)
1. Create a sandbox **test seller** user at developer.ebay.com → Sandbox user.
2. In the ERP, go to eBay Accounts → **+ Add eBay account** with environment **Sandbox** and marketplace EBAY_GB, then **Connect with eBay**. Sign in as the sandbox seller and accept.
3. Back in the ERP the account should show **Connected**. Click **Test connection**; it should report the sandbox username.
4. **Load policies**: the sandbox seller must have business policies (create them in the sandbox Seller Hub, or opt in through the Account API) and an inventory location (`POST /sell/inventory/v1/location/{key}`).
5. Create a listing (draft) with a valid sandbox **leaf category ID**, an `https` image URL, and the item specifics the category requires. Then **Publish**. Check that an eBay item ID appears; fix any errors shown in *Last eBay error*.
6. Buy it with a sandbox **test buyer**, then click **Sync now**. The order should appear, stock should go down for the linked SKU, and a SALES income entry should be created.
7. **Mark dispatched** with a tracking number and confirm in the sandbox that the order shows as shipped.
8. As the buyer, ask a question on the item, then **Sync now**. The question should appear in Buyer Messages. Reply and confirm the buyer receives it.
9. Open a return as the buyer, then **Sync now** and check Returns & Refunds.
10. Record each result in `SyncLog` (visible on the account dashboard). Only enable production once every step passes.

## 4. Going to production
* Create the Production keyset and RuName (same callback URL), then set `EBAY_ENVIRONMENT=PRODUCTION`.
* Add each real seller account as **Production** and click **Connect** while signed in to eBay as that seller. Repeat for every account. Each one stores its own encrypted tokens.
* Assign employees to accounts from **Employees → employee → eBay account access**.
* eBay call limits: the Trading and Sell APIs have daily quotas. The default 15-minute sync is well within standard limits for a few accounts. Request a higher quota through eBay's Application Growth Check if needed.
* Refresh tokens last about 18 months. The app refreshes access tokens automatically, marks accounts **Expired** and notifies managers when re-authorisation is needed.
