#!/bin/sh
set -e

echo "[entrypoint] Prisma generate..."
# Optional: debug
# export DEBUG="*prisma*"

if [ -f ./prisma/schema.prisma ]; then
  mkdir -p ./data
  npx prisma generate --schema=./prisma/schema.prisma
  echo "[entrypoint] Prisma migrate deploy..."
  npx prisma migrate deploy --schema=./prisma/schema.prisma
else
  echo "[entrypoint] prisma/schema.prisma not found" >&2
  exit 1
fi

echo "[entrypoint] Starting app..."
exec npm run docker-start
