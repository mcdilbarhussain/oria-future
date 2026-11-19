# ORIA FUTURE – eCommerce ERP & eBay Multi-Account Management

A full-stack ERP for **ORIA FUTURE**: multiple eBay seller accounts, the UK warehouse, China supplier procurement, finance and team collaboration in one secure web application.

> **Status:** all 24 required pages and their back-end workflows are built, connected to PostgreSQL and covered by automated tests (18 unit tests and a 96-check end-to-end smoke test, all passing).
> **The eBay integration is implemented against eBay's official APIs but has not yet been run against eBay.** No eBay application keys were available while it was built. Use the eBay **Sandbox** first. See [docs/EBAY_SETUP.md](docs/EBAY_SETUP.md). Until an account is connected, the eBay screens show **DEMO** accounts with sample data, clearly labelled as such.

## Contents
| Doc | What's inside |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, module map, database schema, security and real-time design |
| [docs/EBAY_SETUP.md](docs/EBAY_SETUP.md) | Step-by-step eBay developer setup, OAuth, sandbox testing and which APIs each feature uses |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Hosting options and costs, production deployment, HTTPS, backups and go-live checklist |
| [docs/ROADMAP.md](docs/ROADMAP.md) | The 10 development phases, what is done, what is left and estimated effort |

## Features (all functional, server-enforced)
- **Owner / Super Admin**: full control of employees, departments, custom roles and the permission matrix (module × view/create/edit/delete/approve/export/manage), activity logs, settings, and approvals.
- **Employees & departments**: create logins and suspend or remove staff (soft delete). Each department gets its own dashboard and group chat. Management can send instructions to a department. Every action is checked against the employee's seniority level.
- **Tasks**: assign to a person or a department, set priority and deadline, attach files, accept → progress → submit → approve, reject or reopen. Tasks are flagged overdue automatically and employees are reminded when a deadline is near. Board and list views.
- **Internal chat (real-time)**: direct messages, department and management groups, files and images, read receipts, online/offline status, search, pinned messages and management-controlled membership.
- **Live notifications** with no page refresh (Server-Sent Events + PostgreSQL LISTEN/NOTIFY): new orders, buyer messages, tasks, low stock, purchase requests, quotations, payment approvals, new employees, eBay disconnects, listing failures and late dispatch.
- **eBay**: multiple accounts with OAuth 2.0 (tokens encrypted with AES-256-GCM, kept server-side only). Each account has its own dashboard and employees only see the accounts assigned to them. Sync covers orders, listings, messages and returns. Listings can be created, published, revised and ended; orders can be dispatched with tracking upload. Also: buyer-message inbox with assignment, templates, internal notes and management review of important replies, returns and refunds, and account performance.
- **Inventory & warehouse**: SKUs, barcodes, stock by location, movements (in, out, damaged, returned, adjustments, transfers) with full history, low-stock alerts, and live listing quantities kept in step with stock.
- **China suppliers**: profiles, catalogues and prices, MOQ, shipping, payment terms, ratings and reviews, communication log, quotations with attachments, order history.
- **Price enquiries**: request quotations, compare landed cost per supplier, submit a recommendation, management approves or rejects.
- **Purchasing**: the full 11-step workflow (low stock → request → management review → quotations → finance review → approval → PO → supplier order → shipment tracking → receipt → automatic inventory update), PO PDF and complete history.
- **Finance**: income and expenses, supplier, shipping and warehouse costs, eBay sales, fees and refunds by account, outstanding payments, balances, approval workflow (with separation of duties), restricted payroll records, and **actual vs estimated profit**.
- **Reports**: 15 reports with date and account filters, exportable to **PDF, CSV and Excel**.
- **Security**: bcrypt (cost 12), TOTP 2FA, httpOnly session cookies with absolute and idle expiry, account lockout, login rate limiting, CSRF origin checks, CSP and security headers, audit and login logs, and soft deletion.

## Quick start (local development)
Requirements: Node 20.11+ and PostgreSQL 14+.
```bash
cp .env.example .env
```
Edit `.env` and set `DATABASE_URL` and `ENCRYPTION_KEY`. Generate the key with:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
Then install, migrate, seed and start:
```bash
npm install
```
```bash
npx prisma migrate deploy
```
```bash
npm run db:seed
```
```bash
npm run dev
```
Open http://localhost:3000.

### Demo logins (seeded – change or remove before going live)
| Role | Email | Password |
|---|---|---|
| Super Admin / Owner | owner@oriafuture.com | `OriaAdmin#2026` (or `SEED_ADMIN_PASSWORD`) |
| General Manager | gm@demo.oriafuture.com | `Demo#Password1` |
| Operations Manager | ops@demo.oriafuture.com | `Demo#Password1` |
| Stock Manager / Worker | stock.manager@ / stock.worker@demo.oriafuture.com | `Demo#Password1` |
| Finance Manager / Worker | finance.manager@ / finance@demo.oriafuture.com | `Demo#Password1` |
| eBay Account Manager | ebay.manager@demo.oriafuture.com | `Demo#Password1` |
| eBay Listing Employee | lister@demo.oriafuture.com | `Demo#Password1` |
| Customer Support | support@demo.oriafuture.com | `Demo#Password1` |
| Office Worker | office@demo.oriafuture.com | `Demo#Password1` |

To seed a production database without demo data, run `SEED_DEMO=false SEED_ADMIN_PASSWORD='…' npm run db:seed`.

## Testing
```bash
npm test
```
Runs the unit tests: RBAC rules, purchasing and task state machines, P&L (actual vs estimated), token encryption and the password policy.
```bash
npm run build && npm start
```
Builds and starts the production server. With it running against a demo-seeded database, run the end-to-end test:
```bash
BASE_URL=http://localhost:3000 npm run smoke
```
The end-to-end test (96 checks) covers every page as the owner, RBAC denial for restricted roles, the task workflow, real-time chat with read receipts, stock movements, the full purchasing workflow updating inventory and finance, employee onboarding, 2FA login, suspension, password reset, the eBay connect flow, and security headers, CSRF and anonymous API access.

## Tech stack
Next.js 15 (App Router, Server Actions) · React 19 · TypeScript · Tailwind CSS · PostgreSQL 16 · Prisma 6 · Server-Sent Events + PostgreSQL LISTEN/NOTIFY · Recharts · ExcelJS · PDFKit · otplib · Docker + Caddy (HTTPS).

## Project layout
```
prisma/            schema.prisma, migrations, seed.ts (demo data)
src/lib/           auth, permissions (RBAC), crypto, events (real-time), notify, audit, storage,
                   reports/export, jobs (scheduler), services/ (inventory, purchasing),
                   workflows/ (pure state machines), ebay/ (OAuth, REST/Trading clients, sync)
src/app/(auth)/    login, 2FA, forgot/reset password
src/app/(app)/     all ERP pages + their server actions (actions.ts per module)
src/app/api/       SSE events, chat, notifications, files, exports, eBay OAuth/notifications, cron, health
scripts/           smoke-test.mjs, backup scripts, docker entrypoint
tests/             vitest unit tests
```
