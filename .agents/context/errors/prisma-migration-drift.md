<!-- Context: errors/prisma-migration-drift | Priority: high | Version: 1.1 | Updated: 2026-09-14 -->

# Prisma migration drift passes `migrate deploy` silently

Purpose: a hand-written (or stale) migration that disagrees with `schema.prisma` deploys **successfully** and then fails at runtime on every write. Treat schema/migration parity as a checkable fact, not an assumption.

## Key points

- **`prisma migrate deploy` does NOT verify the schema.** It only replays migration files it has not yet recorded and exits 0; it never compares the resulting database against `schema.prisma`. `prisma migrate status` will even print _"Database schema is up to date!"_ while a table is missing columns the client writes. A drifted migration therefore passes every deploy gate.
- **The failure is invisible, and `db push` hides it locally.** Prisma's client names every non-optional model field in its INSERT, so absent columns raise `column "…" does not exist`. A write path that wraps its insert in `try/catch` to protect the caller (correctly — an audit failure must not roll back a real mutation) swallows it into a `console.error`: the mutation succeeds and nothing is persisted. A read path returning an empty list on error is worse — the UI renders a healthy empty table. Meanwhile dev/e2e flows that run `prisma db push` build tables _from the schema_, so local and CI stay green while `migrate deploy` environments are broken. Always test against a database built by `migrate deploy`.
- **The parity check is now enforced in CI — it is not a manual ritual.** The `ci` job in `.github/workflows/main.yml` runs `prisma migrate deploy` and then a **"Verify migrations match the Prisma schema"** step:

  ```bash
  npx prisma migrate diff \
    --from-url "$DATABASE_URL" \
    --to-schema-datamodel prisma/schema.prisma \
    --script --exit-code
  ```

  `--exit-code` exits **2** when the diff is not empty (`0` = empty, `1` = error), so drift fails the build. It reads the same service database the deploy step just migrated, so no extra service is needed — and it is the _only_ gate that catches this class, because the deploy above it passes either way. Run the same command by hand (drop `--exit-code` to read the SQL) against a database migrated with `prisma migrate deploy`; use a fresh scratch database (never the dev database) — a throwaway `postgres:16-alpine` container on a free port is enough. `-- This is an empty migration.` is the pass condition, and anything else is drift whose printed SQL is the fix.

- **Fix an unmerged branch by replacing the migration, not stacking one.** Delete the migration directory, regenerate from the schema with `npx prisma migrate dev --name <same-name>`, and commit the SQL it produced. Once a migration has been applied in a shared environment it is effectively immutable: editing it in place then silently does nothing there, and a corrective follow-up migration is the only safe move.
- **Never hand-write migration SQL.** Generate it, then read the generated file to confirm it matches the model — nullability, `ON DELETE` action, `@updatedAt`, indexes.

## References

- `prisma/schema.prisma` · `prisma/migrations/` · `.github/workflows/main.yml` (the CI parity gate) · `AGENTS.md` §4 (run commands) · `architecture/admin-console` (the audit store that hit this) · ticket P5.4 `86cbbpypx`
