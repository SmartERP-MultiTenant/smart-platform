<!-- Context: errors/db-port-conflict | Priority: high | Version: 1.0 | Updated: 2026-08-17 -->

# DB port conflict (5432 taken)

**Symptom:** `docker run ... -p 5432:5432` fails with `failed to bind host port 0.0.0.0:5432/tcp: address already in use`; or Prisma `P1000 password authentication failed` against localhost:5432 even with the right credentials.

**Cause:** a Postgres service **on the host machine** already listens on `127.0.0.1:5432` (from another project). Docker's port mapping collides, and TCP auth against the host instance rejects the container's password. A pre-initialized volume also ignores `POSTGRES_PASSWORD` env (init only runs on an empty PGDATA) — the classic fake "wrong password".

## Fix

- Run the kit's Postgres on **5433**:
  `docker run -d --name saas-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=saas -p 5433:5432 -v saas_pgdata:/var/lib/postgresql/data postgres:16-alpine`
- `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/saas`.
- To reset a stale volume: `docker rm -f saas-postgres && docker volume rm saas_pgdata && <recreate>`.

## Verify

`PGPASSWORD=postgres psql -h 127.0.0.1 -p 5433 -U postgres -d saas -c "SELECT 1;"`
