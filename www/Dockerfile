FROM oven/bun:1.2.20-alpine AS base

FROM base AS deps
WORKDIR /app

COPY package.json bun.lock* turbo.json ./

COPY apps apps
COPY packages packages
RUN find apps packages -mindepth 1 -maxdepth 2 -type f ! -name 'package.json' -delete && \
    find apps packages -mindepth 1 -type d -empty -delete

RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1

RUN bun run build

FROM base AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV APP_NAME=www

COPY --from=builder /app/apps ./apps

COPY --from=builder --chown=nextjs:nodejs /app/apps/*/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/*/.next/static ./apps/
COPY --from=builder --chown=nextjs:nodejs /app/apps/*/public ./apps/*/public

COPY --from=builder /app/packages/db ./packages/db
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock
COPY --from=builder /app/turbo.json ./turbo.json

RUN mkdir -p /app/.turbo/cache && chown -R nextjs:nodejs /app/.turbo
RUN mkdir -p /app/apps/www/.next/cache/images /app/apps/blog/.next/cache/images && \
    chown -R nextjs:nodejs /app/apps/www/.next/cache /app/apps/blog/.next/cache

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "-c", "bun run apps/${APP_NAME}/server.js"]
