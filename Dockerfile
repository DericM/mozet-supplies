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

RUN npm ci --omit=dev && npm cache clean --force \
	&& npm remove @shopify/cli || true

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]
