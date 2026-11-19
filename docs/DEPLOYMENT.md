# Deployment & hosting

## Required services
| Need | Recommended | Alternatives | Approx. cost / month |
|---|---|---|---|
| App server (Node 20+, long-lived process for SSE + scheduler) | VPS 2 vCPU / 4 GB (Hetzner CPX21, DigitalOcean, Lightsail) running `docker compose` | Render / Railway / Fly.io web service (Docker) | £8–£25 |
| PostgreSQL 16 | Included in docker-compose on the VPS | Managed: Neon, Supabase, Render, DigitalOcean Managed PG (point-in-time recovery) | £0 (on VPS) – £15 |
| HTTPS | Caddy (automatic Let's Encrypt), included | Platform-managed TLS | £0 |
| File storage | Docker volume on the VPS (backed up nightly) | S3 / Cloudflare R2: swap `src/lib/storage.ts` for an S3 adapter | £0–£5 |
| Email (password resets) | Any SMTP: Postmark, SendGrid, Microsoft 365, Google Workspace | – | £0–£10 |
| Domain | e.g. `erp.oriafuture.com` | – | ~£1 |
| Off-site backups | Copy `./backups` to object storage (rclone / restic cron) | Managed DB backups | £1–£3 |

> Serverless hosts such as Vercel are **not** recommended as-is. Real-time SSE connections and the in-process scheduler need a long-running Node process. If you use one, set `ENABLE_INTERNAL_SCHEDULER=false`, call `/api/cron/run` from a cron service, and expect SSE connections to be cut at the function timeout.

## Option A – single VPS with Docker (recommended)
1. Create an Ubuntu 24.04 VPS and install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
2. Point the DNS **A record** for `erp.yourdomain.com` at the VPS IP.
3. Clone the repository and configure it:
   ```bash
   git clone <repo> oria && cd oria && cp .env.example .env
   ```
   Fill in `.env`:
   * `DOMAIN=erp.yourdomain.com` and `APP_URL=https://erp.yourdomain.com`
   * `POSTGRES_PASSWORD`: a long random string
   * `ENCRYPTION_KEY`: 32 bytes, base64. **Back this key up separately; without it the stored eBay tokens and 2FA secrets cannot be decrypted.**
   * `CRON_SECRET`: a random string
   * `SEED_ON_START=true`, `SEED_DEMO=false` (or `true` for a demo instance) and `SEED_ADMIN_PASSWORD` for the **first** start only
   * SMTP settings and eBay keys (see EBAY_SETUP.md)
4. Start the stack:
   ```bash
   docker compose up -d --build
   ```
   Migrations run automatically on start and Caddy obtains the TLS certificate.
5. Sign in as `owner@oriafuture.com` with `SEED_ADMIN_PASSWORD`, change the password and enable 2FA. Then set `SEED_ON_START=false`.
6. Firewall: allow only ports 22, 80 and 443 (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`).

**Updates:**
```bash
git pull && docker compose up -d --build
```
Migrations apply automatically.

**Backups:** the `backup` service writes `backups/oria-YYYYMMDD-HHMM.dump` (pg_dump custom format) and `uploads-*.tgz` nightly at 02:30 UTC and keeps 14 days. Copy them off the server, for example with rclone to R2 or S3.

**Restore:**
```bash
docker compose exec -T db pg_restore --clean --if-exists -U oria -d oria_erp < backups/oria-<ts>.dump
```

## Option B – Platform (Render / Railway / Fly.io)
* Create a managed PostgreSQL and a Docker web service from this repo. The Dockerfile runs migrations on start.
* Set the environment variables from `.env.example`, plus `DATABASE_URL` from the managed DB.
* Attach a persistent disk at `/app/storage/uploads`, or implement the S3 storage adapter.
* Health check path: `/api/health`.

## Option C – bare Node (no Docker)
Build once:
```bash
npm ci && npx prisma migrate deploy && npm run build
```
Seed the first time only:
```bash
SEED_DEMO=false SEED_ADMIN_PASSWORD='...' npm run db:seed
```
Then run `npm start` under systemd or pm2 behind nginx or Caddy. For nginx, set `proxy_buffering off;` for `/api/events`. Schedule `scripts/backup.sh` with cron.

## Go-live checklist
- [ ] HTTPS working, `APP_URL` set to the https URL
- [ ] Strong unique `ENCRYPTION_KEY`, `CRON_SECRET`, DB password, stored in a password manager
- [ ] Owner password changed, 2FA enabled for owner and managers (Settings → require 2FA reminder)
- [ ] Demo data not seeded, or demo users removed (`*@demo.oriafuture.com`) and DEMO eBay accounts archived
- [ ] SMTP tested (Forgot password)
- [ ] eBay sandbox checklist passed, then production keys and account-deletion endpoint configured
- [ ] Backups verified by doing a test restore
- [ ] Employees created with the correct roles and eBay account assignments
- [ ] `npm test` and the smoke test pass on a staging copy
