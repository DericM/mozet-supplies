FROM node:20-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    openssl \
    libssl3 \
  && rm -rf /var/lib/apt/lists/*

# ---------- Builder stage ----------
FROM base AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PRISMA_CLIENT_ENGINE_TYPE=binary \
  PRISMA_CLI_QUERY_ENGINE_TYPE=binary \
  PRISMA_ENGINES_CHECKS=1 \
  DEBUG="*prisma*"
COPY package.json package-lock.json* ./
RUN npm ci && npm remove @shopify/cli || true
COPY . .
# Diagnostics to help identify build failures in CI
RUN node -v && npm -v && npx prisma --version || true
# Ensure Prisma client is generated before server bundling
RUN npx prisma generate --log-level info
RUN npm run build

# ---------- Runtime stage ----------
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
# Use the exact node_modules from the builder to avoid runtime resolution issues,
# then prune devDependencies for a lean image.
COPY --from=builder /app/node_modules ./node_modules
RUN npm prune --omit=dev && npm cache clean --force && npm remove @shopify/cli || true
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["npm", "run", "docker-start"]
