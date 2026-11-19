# ORIA FUTURE ERP – Architecture

## 1. System overview
```
                 ┌──────────────────────────── Browser (desktop / tablet / mobile) ───────────────────────────┐
                 │  React 19 UI (server-rendered pages, small client islands: chat, charts, modals, bell)     │
                 │  EventSource('/api/events')  ◄── live notifications, chat, presence                        │
                 └───────────────▲───────────────────────────────┬────────────────────────────────────────────┘
                                 │ HTTPS (Caddy / platform TLS)  │ Server Actions + JSON APIs (same-origin, cookie session)
┌────────────────────────────────┴───────────────────────────────▼────────────────────────────────────────────┐
│ Next.js 15 Node server (one or more instances)                                                               │
│  middleware ─ cookie gate                                                                                    │
│  lib/auth ─ session lookup, idle/absolute expiry, 2FA state, RBAC `can(module, action)`, eBay account scope  │
│  Server Actions (per module)  →  zod validation → permission check → Prisma transaction → audit → notify    │
│  lib/events ─ publish(): pg_notify('oria_events') ──► every instance LISTENs ──► SSE fan-out to users        │
│  lib/ebay ─ OAuth, token refresh, REST (Sell APIs) + Trading (XML) clients, sync, publish, dispatch, replies │
│  lib/jobs ─ scheduler (instrumentation hook or POST /api/cron/run): overdue tasks, reminders, eBay sync      │
│  lib/storage ─ uploads to a persistent volume, served only through authenticated /api/files/[id]            │
└───────────────┬───────────────────────────────────────────────────────────────┬──────────────────────────────┘
                │ Prisma                                                        │ HTTPS (server-side only)
        ┌───────▼────────┐                                            ┌─────────▼──────────────────────────┐
        │ PostgreSQL 16  │  nightly pg_dump + uploads archive         │ eBay APIs (Sandbox / Production)   │
        └────────────────┘                                            └────────────────────────────────────┘
```
**Why this shape**
* A single TypeScript codebase (Next.js) keeps the UI and back-end in one place for a small team, while Server Actions mean there is **no client-side data layer to bypass**. Every mutation runs on the server and checks permissions.
* PostgreSQL holds all state, including the real-time fan-out (LISTEN/NOTIFY), so you can run several app instances without Redis. Redis can be added later if traffic needs it.
* Modular: each business area is a folder under `src/app/(app)/<module>` with its pages and `actions.ts`. Shared domain logic lives in `src/lib/services` and pure, unit-tested rules live in `src/lib/workflows`. Marketplaces live under `src/lib/<marketplace>`, so you can add an Amazon or OnBuy module alongside `src/lib/ebay`.

## 2. Module map
| Module (RBAC key) | Pages | Key tables |
|---|---|---|
| dashboard | /dashboard (role-aware widgets) | – |
| employees | /employees, /employees/[id], /profile | User, Session, LoginLog |
| departments | /departments, /departments/[id] (department dashboard) | Department |
| roles | /roles, /roles/[id] (permission matrix) | Role, RolePermission |
| tasks | /tasks (list/board), /tasks/[id] | Task, TaskComment, FileAsset |
| chat | /chat | ChatChannel, ChatMember, ChatMessage |
| requests | /requests (assistance, balance enquiries, daily reports) | ApprovalRequest, DailyReport |
| ebay_accounts | /ebay/accounts, /ebay/accounts/[id] (per-account dashboard) | EbayAccount, EbayAccountAssignment, EbayOAuthState, SyncLog |
| ebay_orders | /ebay/orders, /ebay/orders/[id], /ebay/returns | EbayOrder, EbayOrderItem, EbayReturn |
| ebay_listings | /ebay/listings, /new, /[id] | EbayListing |
| buyer_messages | /ebay/messages, /ebay/messages/[id] | BuyerMessageThread, BuyerMessage, ConversationNote, ReplyTemplate |
| inventory / warehouse | /inventory, /inventory/[id], /warehouse | Product, StockLevel, StockMovement, Warehouse |
| suppliers / enquiries | /suppliers, /suppliers/[id], /enquiries, /enquiries/[id] | Supplier, SupplierProduct, SupplierReview, SupplierCommunication, PriceEnquiry, Quotation |
| purchasing | /purchasing, /purchasing/requests/[id], /purchasing/orders/[id] | PurchaseRequest, PurchaseOrder, PurchaseOrderItem |
| finance / payroll | /finance, /finance/transactions, /finance/payroll | Transaction, FinanceAccount, EmployeePayment |
| reports | /reports (15 reports, PDF/CSV/Excel) | – |
| activity_logs | /activity-logs (audit + login logs) | AuditLog, LoginLog |
| settings | /settings | CompanySetting, Warehouse |
| (all) | /notifications, /search | Notification |

## 3. Database schema (PostgreSQL via Prisma)
Full definition: [`prisma/schema.prisma`](../prisma/schema.prisma) (≈45 tables). Conventions:
* `deletedAt` = soft delete on business records (users, products, suppliers, transactions, POs, listings, tasks…). History is never destroyed.
* Money is stored as `Decimal(14,2)` with its currency alongside. Finance rows carry `isEstimated` (forecast vs actual), `status` (approval) and `paymentStatus` (paid or outstanding).
* `isDemo` marks seeded sample data so it is labelled in the UI and can be purged.

```
Role 1─* RolePermission(module, action)       Department 1─* User *─1 Role
User 1─* Session / LoginLog / AuditLog / Notification / EbayAccountAssignment *─1 EbayAccount
Task *─1 User(assignee) / Department ; Task 1─* TaskComment ; FileAsset(entityType, entityId) – polymorphic attachments
ChatChannel(DIRECT|GROUP|DEPARTMENT) 1─* ChatMember(lastReadAt → read receipts) / ChatMessage(pinned, fileId)
Product 1─* StockLevel *─1 Warehouse ; Product 1─* StockMovement(type, signed qty, balanceAfter)
Supplier 1─* SupplierProduct / SupplierReview / SupplierCommunication / Quotation / PurchaseOrder
PriceEnquiry 1─* Quotation *─1 PurchaseRequest ; PurchaseRequest(status machine, history JSON) 1─1 PurchaseOrder 1─* PurchaseOrderItem
Transaction *─1 EbayAccount / Supplier / FinanceAccount / PurchaseOrder ; EmployeePayment *─1 User (restricted)
EbayAccount 1─* EbayOrder 1─* EbayOrderItem ; EbayAccount 1─* EbayListing / EbayReturn / BuyerMessageThread 1─* BuyerMessage / ConversationNote ; SyncLog
```

## 4. Security design
| Concern | Implementation |
|---|---|
| Passwords | bcrypt cost 12; policy ≥10 chars, upper, lower and digit; lockout for 15 min after 5 failures; per-IP login rate limit; constant-time unknown-user path |
| Sessions | 256-bit random token in an httpOnly, SameSite=Lax, Secure cookie; only the SHA-256 hash is stored; absolute TTL (`SESSION_TTL_HOURS`) and idle timeout (settings); force sign-out; sessions are killed on suspension or password change |
| 2FA | TOTP (RFC 6238) via authenticator apps. The secret is AES-GCM encrypted. A pending-2FA session cannot access anything else |
| Authorisation | `requirePage()` for pages and `assertPerm()` for every Server Action and API route. Role-management actions are hard-wired to the Super Admin. Managers cannot manage people at or above their own level. eBay data is scoped to assigned accounts. Self-approval is blocked (purchasing and finance) |
| Secrets | eBay client secret and DB credentials live in env vars only. OAuth access and refresh tokens are AES-256-GCM encrypted at rest and never sent to the browser |
| Web attacks | Server Actions with origin check (Next.js) and a same-origin check on JSON APIs; CSP, HSTS, X-Frame-Options DENY, nosniff; zod validation of all input; Prisma parameterised queries; CSV formula-injection escaping; upload MIME and size allow-list; files only via authenticated route (except explicit public listing images) |
| Audit | `AuditLog` for important changes (before/after JSON, IP), `LoginLog` for every sign-in attempt, payroll page views logged |
| Data | Soft deletion; nightly `pg_dump` + uploads archive with 14-day retention (docker-compose `backup` service) |

## 5. Real-time design
`publish(event)` → `pg_notify('oria_events', json)` → each app instance holds one `LISTEN` connection → in-process EventEmitter → each open `/api/events` SSE stream filters events by user ID. Presence is tracked from open SSE connections per instance. With several instances behind a load balancer, presence is per instance; the rest of real-time works across all instances. Reverse proxies must not buffer SSE (`flush_interval -1` in the Caddyfile; `X-Accel-Buffering: no` for nginx).

## 6. Background jobs
`src/lib/jobs.ts` runs every `EBAY_SYNC_INTERVAL_MINUTES` (default 15) through the Next.js instrumentation hook, or externally with `POST /api/cron/run` and `Authorization: Bearer $CRON_SECRET`. It marks overdue tasks, sends deadline reminders, raises late-dispatch alerts, syncs connected eBay accounts and expires sessions. With more than one instance, set `ENABLE_INTERNAL_SCHEDULER=true` on one instance only, or use the cron endpoint.
