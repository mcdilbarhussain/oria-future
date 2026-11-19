#!/bin/sh
set -e
echo "[oria] applying database migrations…"
prisma migrate deploy --schema=/app/prisma/schema.prisma
if [ "$SEED_ON_START" = "true" ]; then
  echo "[oria] seeding database (SEED_DEMO=${SEED_DEMO:-true})…"
  tsx /app/prisma/seed.ts || echo "[oria] seed skipped/failed (already seeded?)"
fi
exec node /app/server.js
