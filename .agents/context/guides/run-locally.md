<!-- Context: guides/run-locally | Priority: high | Version: 1.1 | Updated: 2026-08-30 -->

# Run locally

Verified end-to-end on this machine (2026-08-17).

## Steps

1. **Postgres:** `docker run -d --name saas-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saas -p 5433:5432 -v saas_pgdata:/var/lib/postgresql/data postgres:16-alpine` — **5433**, not 5432 (host conflict, see `errors/db-port-conflict`).
2. **Env:** `.env` exists; key values: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/saas`, `NEXTAUTH_URL=http://localhost:4002`, `APP_URL=http://localhost:4002`, `NEXTAUTH_SECRET=<openssl rand -base64 32>`, `AUTH_PROVIDERS=credentials`.
3. **Schema:** `npx prisma db push` (already synced).
4. **Run:** `npm run dev` (serves on `http://localhost:4002`).
5. **Verify:** open <http://localhost:4002> → Create Account with any email+password (credentials provider, no SMTP needed) → create a team → explore `settings/`, `teams/<slug>/sso`, `audit-logs`, `webhooks`, `api-keys`.

## Dev vs prod schema sync

- Local/dev: `docker-compose.yml` is **development-only** (Postgres on 5432; local `npm run build` runs `prisma db push` — fine for dev).
- Production: the CD pipeline runs `prisma migrate deploy` explicitly **before** swapping the container; the image entrypoint no longer runs `db push`. Never `db push` a prod schema (see `docs/CI-CD.md`).
- Production deploys run from GHCR images via `docker-compose.prod.yml` / `docker-compose.platform.override.yml` — the server never compiles the kit.

## Notes

- Docker volume `saas_pgdata` persists data; recreate container+volume only if you need a clean DB (init env is ignored once data exists — this caused a fake password mismatch before).
- `npm run dev` uses the port baked into package.json (`4002`); override with `npm run dev -- -p <port>` if ever needed.
