# Development roadmap & status

| Phase | Scope | Status |
|---|---|---|
| 1. Architecture & database | Next.js + PostgreSQL/Prisma, ~45-table schema, RBAC model, soft deletes, audit | ✅ Done |
| 2. Frontend & dashboard | Navy/gold design system, responsive shell, sidebar, role-aware dashboard, charts, tables, filters | ✅ Done |
| 3. Auth & employees | Login, 2FA (TOTP), password reset, sessions, lockout, employee CRUD/suspend/remove, profile | ✅ Done |
| 4. Departments, permissions, tasks | Department dashboards and instructions, permission matrix and custom roles, full task workflow | ✅ Done |
| 5. Chat & notifications | Real-time chat (DM/groups/files/receipts/presence/pins/search), live notifications | ✅ Done |
| 6. Inventory, warehouse, suppliers | SKUs, barcodes, movements, low stock, suppliers, catalogues, reviews, communications, price enquiries | ✅ Done |
| 7. Finance & purchasing | Transactions with approvals, actual vs estimated, balances, payroll (restricted), 11-step purchasing, PO PDF | ✅ Done |
| 8. eBay integration | OAuth multi-account, sync (orders, listings, messages, returns), publish/revise/end, dispatch, replies, performance | 🟡 Code complete; **needs sandbox verification with real eBay keys** (docs/EBAY_SETUP.md) |
| 9. Reports, testing, security | 15 reports with PDF/CSV/Excel export, 18 unit tests, 96-check E2E smoke test, security review | ✅ Done (an external penetration test is recommended before go-live) |
| 10. Deployment | Dockerfile, docker-compose (Postgres, Caddy HTTPS, nightly backups), health check, guide | 🟡 Ready; needs your server, domain and secrets. The Docker image was not built in the build environment, so test it on staging first |

## Recommended next steps (in priority order)
1. **eBay sandbox verification**: run the checklist in EBAY_SETUP.md and fix any field-level mismatches eBay reports (typically category item specifics and policies).
2. **Staging deployment**: run `docker compose up` on a VPS with a staging domain, run the smoke test against it, and do a backup/restore drill.
3. **S3/R2 storage adapter** if you want stateless app servers (`src/lib/storage.ts`).
4. **eBay Finances API** for exact per-order fees and payouts reconciliation (scope already requested).
5. **Listing migration** (`bulk_migrate_listing`) so listings created on eBay.co.uk can be fully edited through the Inventory API.
6. Optional: barcode scanner input on the warehouse screen (USB scanners already work as keyboard input in search fields), email digests, additional marketplaces (Amazon SP-API, OnBuy) in `src/lib/<marketplace>`.

## Estimated effort for the remaining work
| Item | Effort |
|---|---|
| eBay sandbox verification & fixes | 2–4 days (depends on eBay approval and category data) |
| Production deployment, DNS, SMTP, go-live checks | 0.5–1 day |
| S3 storage adapter | 0.5 day |
| Finances API reconciliation | 2–3 days |
| eBay production keyset approval (eBay's own review) | eBay's timeline, often days |
| Penetration test (external) | 2–5 days, third party |
