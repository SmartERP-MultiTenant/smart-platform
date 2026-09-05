# Platform Admin Bootstrap (P5.2)

How to grant a user the `PLATFORM_ADMIN` role (the only gate for `/admin` and
`/api/admin/*`). The role lives on the platform `User` record — it is
independent from team roles and from the ERP's own `isSuperAdmin` flag.

## Local development

1. Register the account first (any email + password via the credentials
   provider), or create it with `npx prisma db seed`.
2. Grant the role:

   ```bash
   npm run seed:platform-admin -- --email=owner@example.com
   # or
   PLATFORM_ADMIN_EMAIL=owner@example.com npm run seed:platform-admin
   ```

3. Verify: log in with that account and open `http://localhost:4002/admin` —
   the placeholder should render (200). Any other account gets 403.

The script only updates `platformRole` on an **existing** user; it never
creates users, prints passwords, or touches key material. The seeded local
test admin (`admin@example.com`) is marked automatically by `prisma/seed.ts`.

## Production (operator runbook)

Production schema changes only go through `prisma migrate deploy`; role
granting is a data update, applied manually by the operator.

> Never commit real admin emails or keys. Replace `<operator-email>` below.

1. **Dry run** — confirm exactly one user matches:

   ```sql
   SELECT id, email, "platformRole"
   FROM "User"
   WHERE lower("email") = lower('<operator-email>');
   -- Expect exactly 1 row. If 0: the account does not exist yet.
   -- If > 1: stop and resolve the duplicate emails first.
   ```

2. **Apply inside a transaction** — PostgreSQL aborts the whole transaction
   when the `DO` block raises, so a wrong row count can never half-apply.
   Run the whole block; if it fails, run `ROLLBACK;` and redo the dry run:

   ```sql
   BEGIN;
   DO $$
   DECLARE
     affected integer;
   BEGIN
     UPDATE "User"
     SET "platformRole" = 'PLATFORM_ADMIN'
     WHERE lower("email") = lower('<operator-email>');

     GET DIAGNOSTICS affected = ROW_COUNT;

     IF affected <> 1 THEN
       RAISE EXCEPTION 'Expected exactly 1 user to update, got %', affected;
     END IF;
   END $$;
   COMMIT;
   ```

   On success psql prints `COMMIT`. On failure it prints the `RAISE
EXCEPTION` message and the transaction is left aborted — run `ROLLBACK;`
   before retrying.

3. **Verify** — must return exactly one row:

   ```sql
   SELECT id, email, "platformRole"
   FROM "User"
   WHERE "platformRole" = 'PLATFORM_ADMIN';
   ```

4. **Log in** as that account and confirm `/admin` returns 200.

### Revoke (rollback)

```sql
UPDATE "User"
SET "platformRole" = NULL
WHERE lower("email") = lower('<operator-email>');
```

Revocation takes effect on the next request: the API guard
(`lib/guardPlatformAdmin.ts`) checks the database on every call, and the JWT
claim (`isPlatformAdmin`) is refreshed from the database and is only
defense-in-depth.

### Audit

Record who granted the role, when, and the target `User.id` in the ops log.
Once P5.4 lands, admin mutations are captured in `AdminAuditLog`.
