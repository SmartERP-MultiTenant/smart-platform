# Demo seed + platform-admin grant — plan

Status: **phases 0, 1 and 3 DONE and independently verified**; phase 2's SQL protocol
DONE, its UI flow checklist **PENDING**, and the production browser smoke **PENDING**.
Fixtures live in [`prisma/demo/`](../prisma/demo/README.md).

| Marker         | Meaning                                                                       |
| -------------- | ----------------------------------------------------------------------------- |
| **DONE**       | executed; evidence recorded in this document                                  |
| **PENDING**    | approved but not yet run — does not block the artifacts, does block the claim |
| **SUPERSEDED** | decided earlier, then invalidated by a phase-0 finding — kept for the record  |
| **CORRECTED**  | an earlier statement in this document was wrong and has been replaced         |

---

## 1. Operator decisions (recorded verbatim)

These were chosen by the operator and are **not** open for reinterpretation:

| #   | Decision                                                                                                                              | Consequence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Local first, then server.** Build and validate the dataset against the empty local DB, then apply a reviewed runbook to production. | Nothing touches 204.44.87.208 until phase 3 is explicitly run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D2  | **Pure SQL via `psql`**, not the repo's npm scripts.                                                                                  | The runtime image ships no `scripts/` and no `tsconfig.json`, so `npm run seed:platform-admin` cannot run on the server. `psql` is the supported mechanism.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| D3  | `smaartx7@gmail.com` → **platform admin, create the account if missing**.                                                             | §5's grant block creates the row when absent, then grants. Credentials handed over out-of-band.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| D4  | **Full dataset on the server too** — not a stripped subset.                                                                           | ⚠️ The demo rows surface on `/admin/users` (12 users), the `/admin` overview tenant table (3 teams, `lib/adminDashboard.ts`), `/admin/audit-logs` (3 rows) and the team dashboard tile counters (`models/dashboard.ts`). **`/admin/revenue` is NOT affected** — that route reads only the ERP M2M aggregate (`erp.listSubscriptionsM2M`, zero prisma calls), so seeded `Subscription`/`Price` rows never reach it. Reversible on both sides (`00-teardown.sql` + `erp-teardown.sql`, phase 3.5), but until rolled back those demo users and teams are not real. Recorded here so the trade-off is explicit rather than accidental. |
| D5  | **Fix the production ERP 404** by syncing `/var/www/multitenant-smart-and-pro/Backend` to `origin/deploy`.                            | See §6. Unblocks `/pricing`, the funnel payment step, and the admin console's ERP reads. This is a `git merge` on a live host — phase 0 must confirm the divergence before it runs.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| D6  | **Rotation hole → fail-closed required variable.** `01-users.sql` must not be able to install a usable hash on its own.               | The committed dev hash moves to `local/all-local.sql` (local only). `01-users.sql` takes `-v demo_password_hash=` and aborts with exit 3, naming the variable, when it is missing or empty. The rotation that used to be a separate manual step is now structural.                                                                                                                                                                                                                                                                                                                                                                 |
| D7  | **Versioning → a PR to `main`**, including the `.agents/context/` update `AGENTS.md` requires in the same commit.                     | `context:validate` must pass. The PR carries the fixtures, the runbook, the plan doc and the context entry together.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| D8  | **Demo lifecycle → leave everything live exactly as applied.** No revocation, no disabling, no teardown now.                          | The 12 demo users and 3 teams remain usable on production, and `demo-platform-admin@demo.smartapro.com` keeps `PLATFORM_ADMIN`, until the operator tears down.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| D9  | **Verification → a browser smoke as the owner and as a demo user** against `platform.smartapro.com`, read-only.                       | **PENDING.** Nothing has exercised a page in a browser yet; every production check so far is row- and hash-level.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**D5 is SUPERSEDED, not performed.** Phase 0 found the backend clone already sitting on
`deploy` @ `2cb867b3` — exactly the merge target D5 named — with the billing routes
answering **401** (route present, key required) instead of 404. The risky live-host
`git merge` was unnecessary and was **not run**. See §6.

---

## 2. Phase 0 — read-only server audit

No writes. Answers the questions that change how phases 1–3 are applied.

```bash
ssh root@204.44.87.208
cd /var/www/multitenant-smart-and-pro

# 1. What is actually deployed?
docker compose ps
docker inspect erp-platform --format '{{.Config.Image}}'

# 2. The platform DB target, from INSIDE the container (Compose hostname, not localhost:5433)
DBURL=$(docker exec erp-platform printenv DATABASE_URL)
DBUSER=$(printf '%s' "$DBURL" | sed -E 's#postgresql://([^:]+):.*#\1#')
DBNAME=$(printf '%s' "$DBURL" | sed -E 's#.*/([^/?]+)(\?.*)?$#\1#')
PGC=$(docker compose ps -q postgres)
echo "user=$DBUSER db=$DBNAME"

# 3. Does the owner's account exist? (decides create vs grant-only in §5)
docker exec "$PGC" psql -U "$DBUSER" -d "$DBNAME" -c \
  'SELECT id, email, "platformRole", "emailVerified", "disabledAt"
     FROM "User" WHERE lower(email) = lower('"'"'smaartx7@gmail.com'"'"');'

# 4. Pre-seed baseline — RECORD THIS, the teardown report compares against it.
docker exec "$PGC" psql -U "$DBUSER" -d "$DBNAME" -c '
SELECT '"'"'User'"'"' t, count(*) FROM "User"
UNION ALL SELECT '"'"'Team'"'"', count(*) FROM "Team"
UNION ALL SELECT '"'"'TeamMember'"'"', count(*) FROM "TeamMember"
UNION ALL SELECT '"'"'Invitation'"'"', count(*) FROM "Invitation"
UNION ALL SELECT '"'"'ApiKey'"'"', count(*) FROM "ApiKey"
UNION ALL SELECT '"'"'AdminAuditLog'"'"', count(*) FROM "AdminAuditLog"
UNION ALL SELECT '"'"'Service'"'"', count(*) FROM "Service"
UNION ALL SELECT '"'"'Price'"'"', count(*) FROM "Price"
UNION ALL SELECT '"'"'Subscription'"'"', count(*) FROM "Subscription";'

# 5. The signup gate — a Gmail address is in the free-mail blocklist
docker exec erp-platform printenv DISABLE_NON_BUSINESS_EMAIL_SIGNUP
docker exec erp-platform printenv AUTH_PROVIDERS CONFIRM_EMAIL EMAIL_ENABLED

# 6. Is the ERP package endpoint live? (expect 401 = route present, 404 = STALE CLONE)
#    Probe the ERP backend directly on its host port. A missing X-Platform-ApiKey also
#    returns 401, so 401 proves the ROUTE exists — which is the whole question. 404 means
#    the clone is stale and the platform line was never built into the image.
for p in platform/billing/packages platform/billing/system-modules platform/billing/subscriptions; do
  printf '%s -> ' "$p"
  curl -sS -m 5 -o /dev/null -w '%{http_code}\n' "http://127.0.0.1:5030/api/$p"
done
# and confirm the clone feeding that image:
printf 'HEAD: ';   git -C /var/www/multitenant-smart-and-pro/Backend log --oneline -1
printf 'BRANCH: '; git -C /var/www/multitenant-smart-and-pro/Backend branch --show-current
```

**Exit criteria:** known `DBUSER`/`DBNAME`, a recorded pre-seed baseline, the owner
account's existence, the value of `DISABLE_NON_BUSINESS_EMAIL_SIGNUP`, and whether the
ERP catalogue answers.

### Executed 2026-09-24 — results, and three corrections to this document

| Question                            | Finding                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform image                      | `smart-platform:sha-3bc9ed8e` — **identical to repo HEAD `3bc9ed8`**, which is why local DDL is predictive                                                   |
| Platform DB                         | container `erp-postgres`, `postgres` / **`smart_platform`** (not `saas`), PostgreSQL 16.15                                                                   |
| Owner account                       | **did not exist** → D3 takes the create path                                                                                                                 |
| Pre-seed baseline                   | User=2, Team=2, TeamMember=1, Invitation=0, ApiKey=0, Service/Price/Subscription=0, AdminAuditLog=0                                                          |
| `DISABLE_NON_BUSINESS_EMAIL_SIGNUP` | **not set** → the free-mail gate is off; a Gmail address can both register and sign in. Proven in production: `esmymohamed2@gmail.com` registered 2026-09-22 |
| ERP catalogue                       | **live** — `/api/platform/billing/{packages,system-modules,subscriptions}` return 401                                                                        |
| ERP paid packages (server)          | already present: Basic 99 / Professional 199 / Enterprise 349 → `/pricing` works there without seeding (§6)                                                  |
| Disk                                | 71% used, below the 85% deploy guard                                                                                                                         |

**CORRECTION 1 — the ERP 404 was already fixed before we acted.** §6's premise is stale.
The clone is on `deploy` @ `2cb867b3` with a clean tree. No 404.

**CORRECTION 2 — enterprise features were never disabled.** `lib/env.ts:224-236` compares
`process.env.FEATURE_TEAM_X !== 'false'`, so **absent means ENABLED**. SSO, DSYNC,
WEBHOOK, AUDIT_LOG, API_KEY and TEAM_DELETION are all live in production. Only
`FEATURE_TEAM_PAYMENTS` resolves false, because it is
`Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET)` and those are absent by design
(payments run through the ERP/Moyasar path). An earlier revision of this document
claimed the features were off and proposed a redeploy to enable them; that was wrong on
both counts and **no compose or `.env` change was made**.

**CORRECTION 3 — `/admin/revenue` does not read the platform database.**
`pages/api/admin/revenue.ts:72` calls only `erp.listSubscriptionsM2M(apiKey)`, and
`lib/adminRevenue.ts` contains **zero** prisma calls. Seeded `Subscription`/`Price` rows
therefore create no phantom revenue. The surfaces demo data actually reaches are
`/admin/users`, the `/admin` overview tenant table (`lib/adminDashboard.ts` →
`prisma.team.findMany`), `/admin/audit-logs`, and the team dashboard tile counters
(`models/dashboard.ts`).

---

## 3. Phase 1 — local dataset (written)

`prisma/demo/*.sql`, deterministic and idempotent. See
[`prisma/demo/README.md`](../prisma/demo/README.md) for the full reference. Coverage
maps 1:1 onto the four selected scopes:

| Scope                 | Delivered by                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core platform tenancy | `01-users.sql` (12 users: platform admin, verified, unverified, locked, disabled, no-team), `02-teams-memberships.sql` (3 teams, OWNER/ADMIN/MEMBER matrix, custom domain, reminder state), `03-invitations.sql` (pending + expired, domain-restricted) |
| Billing & pricing     | `04-billing.sql` (2 services, 3 prices, active + cancelled subscription) and `erp-paid-packages.sql` (3 paid ERP packages — the funnel has nothing sellable without them)                                                                               |
| Enterprise features   | `05-apikeys-auditlog.sql` (3 API keys incl. expired, 3 audit rows across all three statuses)                                                                                                                                                            |
| ERP cross-repo        | `06-erp-link.sql` (flagship team linked to the local ERP tenant) + `erp-paid-packages.sql` (§3: `SubscriptionModules`, which the ERP derives `ActiveModules` from)                                                                                      |

### Hard requirements honoured

- **Explicit ids everywhere.** Verified against live DDL: the id columns have no
  database default (`@default(uuid())` is client-side), so an omitted id is a hard
  failure. This is the trap the stock seed and any hand-written SQL must avoid.
- **`"User".name` is NOT NULL** with no default — every user insert sets it.
- **Enum casts** are explicit (`'PLATFORM_ADMIN'::"PlatformRole"`, `'OWNER'::"Role"`).
- **Invitations have no status column** — pending vs expired is `expires` alone, and
  revocation is a `DELETE`. Documented rather than invented.
- **The password hash is a required input, not a literal** (D6). `01-users.sql` carries
  no usable hash and fails closed when the variable is missing or empty; the one
  committed hash lives in `local/all-local.sql`, which is local-only. Probed outcomes
  (psql 18.6) are recorded at the top of `01-users.sql`:

  | Input             | Exit | Message                                              |
  | ----------------- | ---- | ---------------------------------------------------- |
  | variable unset    | 3    | `demo_password_hash is required …`                   |
  | variable empty    | 3    | `demo_password_hash must be a non-empty bcrypt hash` |
  | variable supplied | 0    | —                                                    |

  Two mechanisms are needed because neither alone suffices: `\if :{?var}` for
  definedness (a bare `:'var'` is left unreplaced by psql, which is version-dependent
  and reports an opaque parse error; `\quit 3` is **not** usable — it ignores the exit
  code and exits 0), and a session GUC for emptiness (psql does not interpolate inside
  dollar quotes, so a `DO` block cannot read the variable directly).

---

## 4. Phase 2 — local end-to-end validation

**4.1 Idempotency protocol** — **DONE** (the acceptance test for phase 1). The local
entry point supplies the dev hash, so it is the wrapper that runs, not `all.sql`:

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/saas
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/demo/local/all-local.sql   # apply
# record counts -> apply again
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/demo/local/all-local.sql   # MUST add zero rows, no error
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f prisma/demo/00-teardown.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/demo/local/all-local.sql   # re-apply cleanly
```

> `all.sql` on its own now **aborts** — it requires `-v demo_password_hash=`. That is
> D6 working as designed, not a regression. Use `local/all-local.sql` locally and
> `server/apply-server.sql` anywhere else.

Additionally: `bcryptjs.compareSync` must validate the seeded hash against the
out-of-band password, or no seeded account can sign in.

**Evidence recorded:** re-apply produced identical counts (12/3/8/4/3/2/3/3/2) and
`UPDATE 0` on the ERP-link file; teardown removed exactly 40 rows and restored the
pre-seed counts; `compareSync(<local demo password>, stored)` returned `true` with a
`false` negative control; all 12 rows carry one distinct hash.

**4.2 Stack** — everything is local and already provisioned:

| Component      | Target                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------ |
| Platform       | `npm run dev` → http://localhost:4002                                                      |
| Postgres       | container `saas-postgres`, host 5433                                                       |
| ERP API        | `dotnet run` in `SmartAndPro.ERP.Inventory/SmartAndPro.ERP.WebAPI` → http://localhost:5001 |
| ERP DB         | container `sqlserver`, host 1433, db `Erp` (`sa` / `YourStrong@Passw0rd`)                  |
| Angular client | `npm start` in `SmartAndPro.ERP.ClientApp` → http://localhost:4200                         |
| Mock IdP       | container `saas-mocksaml` → http://localhost:4000                                          |
| Mail           | `docker compose up -d mailpit`; SMTP 1025, UI http://localhost:8025                        |

**4.3 Flow checklist** — **PENDING** (never executed: no browser has run a page in this
environment or on production). Each line is pass/fail evidence, not a smoke test:

1. Public funnel: `/pricing` renders the three paid DEMO packages with SAR prices.
2. Register a new tenant through the funnel → payment step appears (requires a
   positive `priceMonthly`, which is exactly what `erp-paid-packages.sql` provides).
3. `/payment/success` polling settles; `/payment/failed` renders with a reference only.
4. Credentials sign-in for a verified demo user; **rejection** for
   `demo-unverified`, `demo-locked`, and `demo-disabled` (three distinct refusals).
5. Team switching across `demo-alpha`/`demo-beta`/`demo-gamma`; slug routing.
6. RBAC: an ADMIN cannot do what an OWNER can; a MEMBER's settings tabs are absent.
7. Invitations: accept the pending token; the expired token is refused by date alone.
8. Settings: API keys list (3 keys, one expired), webhooks page scoped per team.
9. `/admin` returns 200 for `demo-platform-admin`, **403** for a non-admin; audit-log,
   users, tenants and revenue pages render.
10. Linked vs unlinked: `/admin` tenant ERP columns populate for `demo-alpha` and
    degrade cleanly for `demo-beta`/`demo-gamma`.
11. ERP handoff: the success page's CTA resolves an allow-listed `ERP_CLIENT_URL`.
12. Angular client: sign in as the demo tenant admin and confirm modules are enabled
    (`ActiveModules` — empty without phase 1's `SubscriptionModules` rows).

---

## 5. Granting `smaartx7@gmail.com` (decision D3)

Runs against the **platform Postgres**, not the ERP. Two differences from the shipped
`docs/platform-admin-bootstrap.md` runbook: it **creates** the account when missing,
and it must set `name` (NOT NULL).

> ⚠️ **The created account must NOT use the demo id namespace.**
> `00-teardown.sql` deletes every row matching `00000000-de30-4000-8000-%`; reusing
> that namespace here would make a routine teardown delete the owner's live account.
> The block below generates a normal random uuid for exactly this reason.

Generate the hash on the server (never commit it), then feed the block in the **same
session** — a psql variable cannot be interpolated inside a `DO $$ … $$` block, so the
value travels as a session GUC. Run the hash generation **inside the platform
container**: the VPS host itself has no guaranteed `node`, while the image ships both
`node` and `bcryptjs`.

```bash
# Read the password WITHOUT echoing it and WITHOUT putting it in argv — an argument
# would be briefly visible to any local user via `ps`. It reaches the container as an
# environment variable, never as a command-line argument.
read -rsp 'Owner password: ' OWNER_PASSWORD; echo
export OWNER_PASSWORD

OWNER_HASH=$(docker exec -e OWNER_PASSWORD erp-platform \
  node -e "console.log(require('bcryptjs').hashSync(process.env.OWNER_PASSWORD,12))")
unset OWNER_PASSWORD

echo "${#OWNER_HASH} chars, starts with: ${OWNER_HASH:0:7}"   # sanity: 60 chars, $2b$12$

{
  printf 'BEGIN;\nSET LOCAL app.owner_password_hash = %s;\n' "'$OWNER_HASH'"
  cat /tmp/grant-platform-admin.sql
  printf 'COMMIT;\n'
} | docker exec -i "$PGC" psql -U "$DBUSER" -d "$DBNAME" -v ON_ERROR_STOP=1 -f -
```

`/tmp/grant-platform-admin.sql` — the block body:

```sql
DO $$
DECLARE
  target_email  text := 'smaartx7@gmail.com';
  owner_hash    text := NULLIF(current_setting('app.owner_password_hash', true), '');
  affected      integer;
  target_id     text;
BEGIN
  -- Case-insensitive lookup: the unique index is on the exact email, so
  -- 'Smaartx7@Gmail.com' must still resolve to the same account.
  SELECT id INTO target_id FROM "User" WHERE lower(email) = lower(target_email);

  IF target_id IS NULL THEN
    -- Create-if-missing (D3). `name` is NOT NULL with no default.
    -- If no hash was supplied the account is created WITHOUT a password, which is
    -- a deliberate, usable state: password is nullable, and the owner then uses the
    -- forgot-password flow to set one. It is never silently given a known password.
    INSERT INTO "User" (id, name, email, "emailVerified", password, "createdAt", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      'Smaartx7',
      lower(target_email),
      now(),
      owner_hash,
      now(),
      now()
    )
    RETURNING id INTO target_id;

    RAISE NOTICE 'Created account % (%), password %',
      target_email, target_id,
      CASE WHEN owner_hash IS NULL THEN 'NOT set — use forgot-password' ELSE 'set from the supplied hash' END;
  ELSE
    RAISE NOTICE 'Account % already exists (%) — granting only', target_email, target_id;
  END IF;

  UPDATE "User"
     SET "platformRole" = 'PLATFORM_ADMIN'::"PlatformRole",
         "updatedAt"    = now()
   WHERE id = target_id;

  GET DIAGNOSTICS affected = ROW_COUNT;

  -- Fail closed: a wrong row count must never half-apply. Postgres aborts the whole
  -- transaction when this raises.
  IF affected <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 user to update, got %', affected;
  END IF;
END $$;
```

Verify (must return exactly one row and `PLATFORM_ADMIN`):

```sql
SELECT id, email, "platformRole" FROM "User" WHERE lower(email) = lower('smaartx7@gmail.com');
```

### The free-mail gate

`lib/email/utils.ts` `isEmailAllowed` is enforced at signup **and** sign-in
(`pages/api/users.ts`, `pages/api/auth/join.ts`, `lib/nextAuth.ts`, invitations). When
`DISABLE_NON_BUSINESS_EMAIL_SIGNUP=true`, `gmail.com` — which is in
`lib/email/freeEmailService.json` — is refused.

**If phase 0 finds that flag on, a Gmail account can neither register nor sign in**, and
this SQL block is the only way in: it bypasses the gate by construction (the gate lives
in application code, not in the database). The account would then be able to hold a
session only if sign-in also passes the gate — so in that case either the flag must be
turned off for the owner's address, or the owner signs in through a provider that does
not apply it. **Confirm this in phase 0 before promising the owner a working login.**

### Executed 2026-09-24 — the owner's account (D3, create path)

Phase 0 found no row for `smaartx7@gmail.com`, so the block above ran its create path
against the production database, inside one transaction, from the workstation:

| Field           | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| id              | `cd6a04d6-7310-4722-b55d-89ffa1f8068b` (random uuid, outside the demo namespace) |
| email           | `smaartx7@gmail.com`                                                             |
| name            | `Smaartx7`                                                                       |
| `platformRole`  | `PLATFORM_ADMIN`                                                                 |
| `emailVerified` | set                                                                              |

Verified after the fact by reading the stored hash back out of the production database
and validating it locally with the repo's own bcryptjs (`compareSync` → `true`, negative
control → `false`). Re-running the block is idempotent and does not clobber the password;
an uppercase variant of the address resolves to the same row; and the account **survives
`00-teardown.sql`** because its id is outside the reserved namespace.

Platform admins became 4: `admin@smartapro.com`, `esmymohamed2@gmail.com`,
`smaartx7@gmail.com`, and `demo-platform-admin@demo.smartapro.com` (the last of which is
demo data and is removed by teardown).

**The free-mail gate did not need bypassing.** Phase 0 found
`DISABLE_NON_BUSINESS_EMAIL_SIGNUP` unset, and production already carries a
Gmail-registered account, so the gate is off in practice. The SQL path bypasses it by
construction regardless.

---

## 6. The production ERP 404 — RESOLVED before we acted (D5 **SUPERSEDED**)

> **No action was needed and none was taken.** Phase 0 (2026-09-24) found
> `/var/www/multitenant-smart-and-pro/Backend` already on branch `deploy` at HEAD
> `2cb867b3` — exactly the merge target D5 named — with a clean working tree, and
> `/api/platform/billing/{packages,system-modules,subscriptions}` answering **401**
> (route present, `X-Platform-ApiKey` required) rather than 404. The running backend
> image `sha-61a83aea` therefore already contains the platform line, and the
> risky live-host `git merge` this section used to prescribe was **not performed**.
>
> The analysis below is kept for the record — it was correct about the _mechanism_
> ("a stale clone 404s, the routes must exist") and about the sync target, and it is the
> reason the audit checked precisely this. What it got wrong was the _state_: the KB
> entry it cites is a 2026-09-20 snapshot, and the situation had been fixed since.
>
> **Consequence for the demo:** `/pricing`, the funnel payment step and the admin
> console's ERP reads work in production without any seeding of the ERP database, which
> is also why `erp-paid-packages.sql` stays local-only.

### Original analysis (stale-state snapshot, 2026-09-20)

Verified context (2026-09-20, `smart-platform/.agents/context/shared/team-workflow.md`):
the ERP clone at `/var/www/multitenant-smart-and-pro/Backend` sits on a **stale
server-local HEAD** (`4a3148a9`, a merge of `deploy` into `development`), and nothing on
the VPS fetches it. Effect: `GET /api/platform/billing/packages`,
`/system-modules` and `/subscriptions` answered **404 in production** while
`…/subscriptions/by-tenant/{guid}` answered 401 (route present).

That directly breaks — regardless of any seeding:
`/pricing` (reads the ERP catalogue), the funnel payment step (needs a positive
`priceMonthly`), and the admin console's per-tenant ERP reads.

The sync target is **`origin/deploy`**, not `origin/development` (`development` alone is
101 commits behind and lacks the vendor line):

```bash
git -C /var/www/multitenant-smart-and-pro/Backend fetch
git -C /var/www/multitenant-smart-and-pro/Backend status --short   # MUST be clean-ish; decide before merging
git -C /var/www/multitenant-smart-and-pro/Backend merge origin/deploy
cd /var/www/multitenant-smart-and-pro && docker compose build backend && docker compose up -d backend
```

> **Do not run this blind.** Three hazards, all real: the checkout may hold
> uncommitted local state; this family's standing rule is that **migration files never
> travel through git** (they are applied server-side), so a merge must not silently
> move migrations; and the KB's stale-checkout finding is a 2026-09-20 snapshot that
> phase 0 must re-confirm. Confirm, then merge.

---

## 7. Phase 3 — server runbook (**EXECUTED** 2026-09-24)

Full commands: [`prisma/demo/README.md` §7](../prisma/demo/README.md). Order is fixed:

1. **Backup** — `pg_dump -Fc` inside the postgres container, copied out and verified,
   **before** any write. Record the pre-seed baseline (phase 0 step 4).
2. **Grant the admin** (§5) — independent of the demo dataset, and the only step the
   owner strictly needs.
3. **Apply the dataset** — via `server/apply-server.sql` (D4: the full set).
4. **Verify** — the count query, then `/admin` 200-as-admin / 403-as-non-admin.
5. **Rollback** — `pg_restore` of the dump (exact), or `00-teardown.sql` (demo rows only).

### Executed record

| Item            | Value                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Backup          | `/var/www/multitenant-smart-and-pro/pre-demo-20260924-074139.dump` — mode 600, 40,696 B                |
| Backup sha256   | `e2cf309ed9812542148c3391c740136bb8d51d7b6e679c6655aaa7029daba359`                                     |
| Backup contents | `pg_restore -l` clean, 17 TABLE DATA entries                                                           |
| Post-apply      | User=15 Team=5 TeamMember=9 Invitation=4 ApiKey=3 Service=2 Price=3 Subscription=2 AdminAuditLog=3     |
| Owner           | `smaartx7@gmail.com` → `PLATFORM_ADMIN` (§5)                                                           |
| ERP link        | `demo-alpha` → `716BCBFD-7598-4CA5-AE88-25A076C86DE0` / `demo` / `https://server-mt.smartapro.com/api` |
| Health          | `{"db":{"ok":true},"erp":{"ok":true}}`                                                                 |
| Real data       | the 2 pre-existing accounts and 2 real teams are untouched; teardown dry-run matched 0 of them         |
| Demo passwords  | rotated to a **server-only** hash; the committed dev hash matches **zero** rows on production          |

**Not done here:** restoring the dump was never exercised (the backup is integrity-checked,
not restore-tested), and no browser touched production — that is D9's pending smoke.

---

## 8. Phase 4 — optional hardening (not scheduled)

- Make `prisma/seed.ts` idempotent, or replace it outright with this dataset.
- Fix `Dockerfile` so `scripts/` and `tsconfig.json` ship, so repo tooling is runnable
  in the container instead of only `psql`.
- Per `AGENTS.md`, any committed change in a covered area (run steps, env, auth) must
  ship **in the same commit** with a matching `.agents/context/` update, followed by
  `npm run context:validate`.

---

## 9. Acceptance criteria

**Status 2026-09-24 — what is actually proven:**

| #   | Criterion                                                       | State       | Evidence                                                             |
| --- | --------------------------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| A1  | The local wrapper applied twice adds **zero** rows, zero errors | **DONE**    | identical counts 12/3/8/4/3/2/3/3/2; `UPDATE 0` on the ERP-link file |
| A2  | `00-teardown.sql` restores the pre-seed counts exactly          | **DONE**    | 40 rows removed; restore matched; sentinel `demo-store` survived     |
| A3  | Seeded hash authenticates the out-of-band password              | **DONE**    | `compareSync` → `true`, negative control → `false`                   |
| A7  | `smaartx7@gmail.com` exists with `PLATFORM_ADMIN`               | **DONE**    | §5's executed record; hash read back from production and validated   |
| A8  | Teardown cannot touch the owner's account or any real row       | **DONE**    | namespace rule; teardown dry-run matched 0 real rows                 |
| A10 | The server conductor aborts without a password hash             | **DONE**    | exit 3 both unset and empty, variable named, no writes               |
| A11 | Production dataset applied and health intact                    | **DONE**    | §7's executed record                                                 |
| A4  | Every account state behaves as documented                       | **PENDING** | needs D9's browser smoke                                             |
| A5  | `/admin` is 200 for the platform admin and 403 for a non-admin  | **PENDING** | needs D9's browser smoke                                             |
| A6  | `/pricing` shows the paid DEMO packages                         | **PENDING** | needs D9's browser smoke (ERP catalogue is confirmed live)           |
| A9  | Local ERP flow works end to end                                 | **PENDING** | §4.3's UI checklist was never executed                               |

A4–A6 and A9 are not blocked by any known defect — they are simply unrun. Everything
that has been claimed DONE above rests on recorded output, not inference.

| #   | Criterion                                                        | Evidence                          |
| --- | ---------------------------------------------------------------- | --------------------------------- |
| A1  | `all.sql` applied twice adds **zero** rows and errors zero times | psql output + before/after counts |
| A2  | `00-teardown.sql` restores the pre-seed counts exactly           | count report vs phase 0 baseline  |
| A3  | Seeded hash authenticates the out-of-band password               | `bcryptjs.compareSync` === true   |
| A4  | Every account state behaves as documented                        | the four sign-in outcomes in §4.3 |
| A5  | `/admin` is 200 for the platform admin and 403 for a non-admin   | HTTP codes                        |
| A6  | `/pricing` shows the paid DEMO packages                          | rendered page                     |
| A7  | `smaartx7@gmail.com` exists with `PLATFORM_ADMIN`                | verification query in §5          |
| A8  | Teardown cannot touch the owner's account or any real row        | §5's namespace rule + review      |
| A9  | Local ERP flow works end to end                                  | §4.3 checklist                    |

---

## 10. Risks

**Updates 2026-09-24.** The `origin/deploy` merge risk is **CLOSED** — phase 0 found the
merge already done and no merge was performed (D5 SUPERSEDED, §6). The rotation risk is
**CLOSED** by D6: the server path cannot run without an explicitly supplied hash, and the
committed dev hash was verified to match **zero** rows on production. Two risks remain
open and are listed in the table below.

| Risk                                                           | Likelihood       | Impact                          | Mitigation                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | ---------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Demo rows read as real customers in `/admin`                   | **Certain** (D4) | Misleading owner-facing numbers | Stated in §1 D4 and the README. Affected surfaces: `/admin/users`, the `/admin` overview tenant table, `/admin/audit-logs`, team dashboard tiles. **`/admin/revenue` is NOT affected** — it reads the ERP M2M aggregate only. `00-teardown.sql` reverses the Postgres side exactly.                                                             |
| Teardown deletes a real row                                    | Low              | High                            | Natural keys are **exact** matches (the three team slugs, the twelve emails) — **not** `LIKE 'demo-%'` prefixes, which would delete a real team slugged `demo-store` and cascade its memberships/invitations/API keys. Proven by a sentinel regression test; the id namespace is reserved and the owner's account is explicitly outside it (§5) |
| Seeded ids collide with real ids                               | Very low         | Medium                          | Reserved `de30` namespace; real ids are random uuids                                                                                                                                                                                                                                                                                            |
| ~~`origin/deploy` merge conflicts or moves migrations~~        | ~~Medium~~       | ~~High~~                        | **CLOSED** — no merge was needed or performed; the clone was already on `deploy` @ `2cb867b3` with a clean tree (§6)                                                                                                                                                                                                                            |
| **12 demo logins are live on production** (D8)                 | **Certain**      | Medium                          | Accepted by decision. Their password is a server-only hash, so it is not repo-readable; `00-teardown.sql` removes all 12 users, 3 teams and the demo admin in one transaction. Until then they are real accounts on a real system.                                                                                                              |
| **`demo-platform-admin` holds `PLATFORM_ADMIN` in production** | **Certain**      | Medium                          | Accepted by decision (D8). It is inside the teardown namespace, so teardown removes the account entirely; to close it sooner, `UPDATE "User" SET "platformRole" = NULL WHERE email = 'demo-platform-admin@demo.smartapro.com';`                                                                                                                 |
| **Backup was integrity-checked, never restore-tested**         | Medium           | High if a rollback is needed    | `pg_restore -l` was clean and the dump is mode 600 with a recorded sha256, but no restore has been exercised. Before relying on it, restore into a scratch database first.                                                                                                                                                                      |
| **No browser has verified production** (D9)                    | **Certain**      | Medium                          | Every production check so far is row- and hash-level. The approved read-only browser smoke closes this; until it runs, the render layer is unverified.                                                                                                                                                                                          |
| Gmail sign-in blocked by the free-mail gate                    | Medium           | High (owner cannot log in)      | Phase 0 reads the flag; §5 explains why SQL bypasses the gate and what still might not                                                                                                                                                                                                                                                          |
| Local ERP stack drift (Node 24 vs Angular 17, stale `Erp` DB)  | Medium           | Medium                          | Local `Erp` DB already verified seeded; pin Node per `.nvmrc` if the client fails                                                                                                                                                                                                                                                               |
| sqlfluff flags `LXR`/`PRS` on the fixtures                     | Certain          | None                            | Documented in the README — psql meta-commands are not SQL; do not delete the safety line                                                                                                                                                                                                                                                        |

---

## 11. Open items

- **D8 accepted the standing exposure.** 12 demo logins plus a demo platform admin are
  live on production. Their hash is server-only (not the committed one), and
  `00-teardown.sql` removes all of it in one transaction — but until that runs, they are
  real accounts. The demo admin's `platformRole` can be revoked on its own if that
  exposure needs closing before teardown.
- **D9 is the last unrun verification.** No browser has touched
  `platform.smartapro.com`; acceptance criteria A4–A6 and A9 stay PENDING until it runs.
  It is read-only by design.
- **The backup is unproven until restored.** `pg_restore -l` confirms structure, not
  recoverability. Restore into a scratch database before depending on it.
- **`AGENTS.md`'s same-commit rule is satisfied by this change set:** the fixtures, the
  runbook, this document and the `.agents/context/` entry (`guides/demo-seed`, plus
  `quick-start` and `run-locally`) travel together, and `npm run context:validate`
  passes.
- **`erp-paid-packages.sql` stays local-only.** The server's ERP already has paid
  packages (Basic 99 / Professional 199 / Enterprise 349), so there is nothing to apply
  there; the local ERP still needs it because its only seeded package is priced 0.00.
