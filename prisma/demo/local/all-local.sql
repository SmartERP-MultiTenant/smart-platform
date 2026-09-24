-- all-local.sql — LOCAL DEVELOPMENT ENTRY POINT for the demo dataset.
--
-- ⚠️ LOCAL ONLY. This file is the ONE place that carries a usable bcrypt hash, and
-- that hash is committed, so it is public by construction. It exists so local dev
-- stays a single command while every non-local path has to supply its own hash
-- (see ../README.md §7.3 — "the committed dev hash must never reach the server").
-- Never run this against a server database, and never copy it into an apply
-- sequence that targets one.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/demo/local/all-local.sql
--
-- `\ir ../all.sql` resolves relative to THIS file, and the variable set below
-- survives into the included conductor and every file it pulls in, so
-- ../01-users.sql's fail-closed guard is satisfied exactly once, here.

\set ON_ERROR_STOP on

-- The shared local dev password for all twelve demo users, bcryptjs 12 rounds —
-- the same cost `lib/auth.ts` uses, so `compareSync` accepts it verbatim. The
-- plaintext is handed over out-of-band (README.md §5) and is deliberately absent.
\set demo_password_hash '$2b$12$sURg3MPD30ICR3PEckR7fOMGMJryCjZDTNmhgT24CFbz4jZeXwqn2'

\ir ../all.sql
