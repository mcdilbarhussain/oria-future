# ── ORIA FUTURE ERP – production image ──
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && npm i -g prisma@6.19.3 tsx@4.20.5 && groupadd -r oria && useradd -r -g oria oria
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src/lib/permissions.ts ./src/lib/permissions.ts
COPY --from=build /app/node_modules/bcryptjs ./node_modules/bcryptjs
COPY scripts/docker-entrypoint.sh /entrypoint.sh
RUN mkdir -p /app/storage/uploads && chown -R oria:oria /app/storage && chmod +x /entrypoint.sh
USER oria
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/entrypoint.sh"]
