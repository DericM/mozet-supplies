FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
		openssl ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

EXPOSE 3000

WORKDIR /app

# Avoid downloading Chromium during install (Puppeteer) – not needed at runtime
ENV NODE_ENV=production \
		PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json* ./

# Install ALL deps for build (includes devDependencies)
RUN npm ci \
	&& npm remove @shopify/cli || true

COPY . .

# Build app (requires devDependencies like Vite)
RUN npm run build \
	&& npm prune --omit=dev \
	&& npm cache clean --force

CMD ["npm", "run", "docker-start"]
