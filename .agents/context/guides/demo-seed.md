<!-- Context: guides/demo-seed | Priority: high | Version: 1.0 | Updated: 2026-09-24 -->

# Demo seed

Deterministic, idempotent demo fixtures for everything the stock `prisma/seed.ts` cannot
cover: account states, billing shape, API keys, admin-audit rows and the ERP link.

## Key points

- **Two entry points, and the choice is not cosmetic.** `prisma/demo/local/all-local.sql`
  is the local one — it is the only file permitted to carry a usable password hash, and
  that hash is committed, so it is public. `prisma/demo/server/apply-server.sql` is for
  every other target and **cannot run** without `-v demo_password_hash=<bcrypt>`.
- **The password hash is a required psql variable, not a literal.** `01-users.sql` fails
  closed (exit 3, message naming the variable) when it is missing or empty. This replaced
  an earlier design that embedded one committed hash and relied on a separate rotation
  step — a step that could be forgotten, and whose failure mode was re-installing a
  publicly readable password on a live system.
- **Idempotent and exactly reversible.** Re-running creates zero rows; `00-teardown.sql`
  removes the dataset by its reserved `00000000-de30-4000-8000-*` id namespace and
  **exact** natural keys (never a `slug LIKE 'demo-%'` prefix, which would match a real
  customer's `demo-store` team and cascade its members).
- **Server target is not the local shape.** The platform database there is
  `smart_platform` in container `erp-postgres` (not `saas` on `localhost:5433`), and the
  ERP link needs the production tenant GUID and a public API URL — which is why
  `server/06-erp-link.server.sql` exists instead of reusing the local file.
- **`erp-paid-packages.sql` is T-SQL, not Postgres**, runs against the ERP database, and
  is local-only: the server's ERP already has paid packages.

## Apply and tear down (local)

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/saas
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/demo/local/all-local.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f prisma/demo/00-teardown.sql
```

Do **not** add `--single-transaction` to a conductor file — it opens its own
`BEGIN`/`COMMIT`, and nesting one lets the inner `COMMIT` end the transaction early.

## References

- `prisma/demo/README.md` — full runbook (server apply, rollback, what is deliberately not seeded)
- `docs/demo-seed-and-admin-grant.md` — decisions, Phase-0 findings, executed production record
- `docs/platform-admin-bootstrap.md` — granting `PLATFORM_ADMIN`
- `guides/run-locally` · `.agents/context/lookup/env-vars`
