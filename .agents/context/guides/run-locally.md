<!-- Context: guides/run-locally | Priority: high | Version: 1.0 | Updated: 2026-08-20 -->

# Run locally

Verified end-to-end on this machine (2026-08-17).

## Steps

1. **Postgres:** `docker run -d --name saas-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saas -p 5433:5432 -v saas_pgdata:/var/lib/postgresql/data postgres:16-alpine` — **5433**, not 5432 (host conflict, see `errors/db-port-conflict`).
2. **Env:** `.env` exists; key values: `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/saas`, `NEXTAUTH_URL=http://localhost:4002`, `APP_URL=http://localhost:4002`, `NEXTAUTH_SECRET=<openssl rand -base64 32>`, `AUTH_PROVIDERS=credentials`.
3. **Schema:** `npx prisma db push` (already synced).
4. **Run:** `npm run dev` (serves on `http://localhost:4002`).
5. **Verify:** open <http://localhost:4002> → Create Account with any email+password (credentials provider, no SMTP needed) → create a team → explore `settings/`, `teams/<slug>/sso`, `audit-logs`, `webhooks`, `api-keys`.

## Notes

- Docker volume `saas_pgdata` persists data; recreate container+volume only if you need a clean DB (init env is ignored once data exists — this caused a fake password mismatch before).
- `npm run dev` uses the port baked into package.json (`4002`); override with `npm run dev -- -p <port>` if ever needed.
