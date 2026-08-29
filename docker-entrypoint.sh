#!/bin/sh
set -e

echo "==> Syncing Prisma database schema..."
npx prisma db push --skip-generate || echo "Warning: prisma db push failed or DB is initializing"

echo "==> Starting SMART PLATFORM on port ${PORT:-4002}..."
exec npm run start
