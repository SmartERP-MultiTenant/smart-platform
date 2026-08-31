#!/bin/sh
set -e

# Production entrypoint: starts the Next.js app by default.
# Any explicit command is executed as-is — e.g. the CD pipeline runs
#   docker compose run --rm --no-deps --no-build platform npx prisma migrate deploy
# which lands here as `exec npx prisma migrate deploy`.
# Schema sync is deliberately NOT done here: migrations belong in the deploy
# pipeline (prisma migrate deploy), never `db push` (see docs/CI-CD.md).

if [ $# -gt 0 ]; then
  echo "==> Executing: $*"
  exec "$@"
fi

echo "==> Starting SMART PLATFORM on port ${PORT:-4002}..."
exec npm run start