<!-- Context: lookup/env-vars | Priority: medium | Version: 1.6 | Updated: 2026-09-14 -->

# Environment variables (.env)

Read mostly through the single config object in `lib/env.ts` (plain `process.env` reads — no zod validation). The three P4.10 keys below that are not in it — `NEXT_PUBLIC_TWITTER_HANDLE`, `NEXT_PUBLIC_APP_STORE_URL` and `NEXT_PUBLIC_PLAY_STORE_URL` — are read directly from `process.env` in their own components. Values below are the **local dev** ones in `.env`.

> **Canonical references (P4.2, 2026-09-07):** per-environment matrix with sources (local/staging/prod), injection and statuses = [`docs/env-matrix.md`](../../../docs/env-matrix.md). Provisioning/rotation/drift/rollback runbook = `docs/CI-CD.md` → §Secret provisioning & environment matrix (P4.2). Key reference (placeholder values only) = `.env.example`. This file mirrors **local dev** values and must stay consistent with the matrix.

## Core

| Key                         | Local value / note                                 |
| --------------------------- | -------------------------------------------------- |
| `NEXTAUTH_URL`              | <http://localhost:4002>                            |
| `APP_URL`                   | <http://localhost:4002>                            |
| `NEXTAUTH_SECRET`           | `openssl rand -base64 32`                          |
| `DATABASE_URL`              | postgresql://postgres:postgres@localhost:5433/saas |
| `NEXTAUTH_SESSION_STRATEGY` | jwt (default)                                      |

## Auth / signup

| Key                                           | Note                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `AUTH_PROVIDERS`                              | `credentials` locally (email+password, no SMTP). Options: github, google, email, saml, credentials, idp-initiated |
| `CONFIRM_EMAIL`                               | false                                                                                                             |
| `DISABLE_NON_BUSINESS_EMAIL_SIGNUP`           | false                                                                                                             |
| `MAX_LOGIN_ATTEMPTS`                          | 5                                                                                                                 |
| `RATE_LIMIT_TRUSTED_HOPS`                     | 1 — trusted proxy hops (P4.22); `0` disables XFF                                                                  |
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | empty (off)                                                                                                       |

## Feature flags

| Key                                                                                  | Note                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `FEATURE_TEAM_SSO` / `_DSYNC` / `_AUDIT_LOG` / `_WEBHOOK` / `_API_KEY` / `_DELETION` | true (enterprise pages enabled)                                     |
| `FEATURE_TEAM_PAYMENTS`                                                              | false locally (Stripe keys empty — enable only when wiring billing) |

**Default-on semantics (M2):** `FEATURE_TEAM_*` are read `!== 'false'` (`lib/env.ts:110-123`) — **omitting a flag enables it**. Staging/prod carry explicit values (matrix §3.5); `FEATURE_TEAM_PAYMENTS=false` in prod until Moyasar/Tabby/Tamara wiring (decision D4).

## Integrations (empty locally)

`SVIX_URL/API_KEY` (webhooks) · `RETRACED_URL/API_KEY/PROJECT_ID` (audit) · `STRIPE_SECRET_KEY/WEBHOOK_SECRET` · `SLACK_WEBHOOK_URL` · GitHub/Google OAuth ids · Sentry (`NEXT_PUBLIC_SENTRY_DSN`, …) · Mixpanel token.

## Behavior toggles

| Key                                                        | Note                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HIDE_LANDING_PAGE`                                        | false — landing served at `/`                                                                                                                                                                                                                                                                                     |
| `GROUP_PREFIX`                                             | smart-platform- (SSO group prefix)                                                                                                                                                                                                                                                                                |
| `NEXT_PUBLIC_DARK_MODE`                                    | false — keep an explicit value everywhere: read `!== 'false'` (`lib/env.ts:108`), so **unset = dark mode ON**; build-time, runtime `.env` cannot change it                                                                                                                                                        |
| `NEXT_PUBLIC_SUPPORT_URL`                                  | Support & Contact channel URL (`https://wa.me/...` or `mailto:...`) wired across landing, trust strip, header, footer, and teams shell                                                                                                                                                                            |
| `NEXT_PUBLIC_TWITTER_HANDLE`                               | X/Twitter handle emitted as `twitter:site` on OpenGraph cards — normalised to a single leading `@` (`components/shared/SEO.tsx:37`); **unset → the tag is omitted, never emitted empty** (`components/shared/SEO.tsx:111`); build-time, needs the owner-approved handle                                           |
| `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL` | Mobile store badges on the landing page — **unset → the badge renders non-interactive "coming soon"** (`span` + `aria-disabled`), never an anchor without `href` (`components/defaultLanding/fenoise/MobileSection.tsx:83,98`); apps not published yet. Both are raw `process.env` reads, not yet in `lib/env.ts` |
| `EMAIL_ENABLED`                                            | true — explicit email gate (`lib/email/sendEmail.ts`); every transactional sender funnels through it. E2e runs shadow it to `false` via `.env.e2e` (Mailpit recipe there)                                                                                                                                         |
| `PLATFORM_ADMIN_EMAIL`                                     | optional — bootstrap target for `npm run seed:platform-admin` (P5.2); `--email` flag takes precedence; never set in prod `.env` with a real admin email committed                                                                                                                                                 |
| `CRON_SECRET`                                              | required for `/api/cron/*` scheduled routes (e.g. `renewal-reminders`) — endpoint returns **503 when unset**; header auth only (`Bearer` / `x-cron-secret`), never query string (`lib/env.ts:139`)                                                                                                                |
| `ERP_TOKEN_ENCRYPTION_KEY`                                 | **required in production** — AES-256-GCM key for `Team.erpAccessToken` (encrypt/decrypt throw when unset + NODE_ENV=production); dev fallback + one-time warning outside production; `NEXTAUTH_SECRET` never used (key separation); `enc:v1:<keyId>` envelope is rotation-ready                                   |

## Code-truth additions (P4.2 ground truth, 2026-09-07)

Vars read by code/compose but **absent from `.env.example`** — provisioned per the matrix, not the example file.

| Key                                                                                                          | Note                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `SECURITY_HEADERS_ENABLED`                                                                                   | `lib/env.ts:7` — default off (`?? false`); set explicitly in staging/prod (matrix §3.1)                                                    |
| `JACKSON_URL` / `JACKSON_EXTERNAL_URL` / `JACKSON_API_KEY` / `JACKSON_PRODUCT_ID` / `JACKSON_WEBHOOK_SECRET` | `lib/env.ts:70-85` — SSO/Jackson lane, `conditional(FEATURE_TEAM_SSO)` (matrix §3.9)                                                       |
| `PORT`                                                                                                       | Server `.env` only — entrypoint default `4002`; integrated VPS maps host `5032:4002` (matrix §3.1; `docker-compose.platform.override.yml`) |
| `PLATFORM_IMAGE_TAG`                                                                                         | Deploy-managed (see Production & CI/CD below)                                                                                              |

**`NEXT_PUBLIC_*` are build-time (B1/D6):** inlined into the client bundle at `next build` — a runtime `.env` change does **not** reach the client. Dockerfile build-arg wiring is deferred to P4.6 (decision D6); until then client Sentry/Mixpanel stay inert while server-side Sentry works at runtime (matrix §3.7/§3.8).

**`.env.e2e` is a 4th provisioned env** (Mailpit): shadows `EMAIL_ENABLED=false` for e2e — not part of the P4.2 staging/prod provisioning.

## Production & CI/CD (server `.env` / GitHub only)

| Key                                                                                                                         | Note                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLATFORM_IMAGE_TAG`                                                                                                        | Server `.env` only — GHCR tag the pipeline deploys (`latest` or `sha-<40 hex>`); the deploy job updates it idempotently                                                                                                                                                       |
| `EMAIL_ENABLED` (prod)                                                                                                      | `true` — deploy adds it idempotently if absent (the gate defaults to disabled); opt out with `EMAIL_ENABLED=false`                                                                                                                                                            |
| `DATABASE_URL` (prod)                                                                                                       | Must use the Compose network hostname (`postgres:5432`) inside the platform container, **not** `localhost:5433`                                                                                                                                                               |
| SSH secrets (`SSH_HOST`/`SSH_USER`/`SSH_PRIVATE_KEY`/`SSH_KNOWN_HOSTS`)                                                     | GitHub Actions `production` environment secrets — never in `.env`                                                                                                                                                                                                             |
| App secrets (P4.2): `ENV_<VAR>` per environment (`ENV_NEXTAUTH_SECRET`, `ENV_ERP_PLATFORM_API_KEY`, `ENV_SMTP_PASSWORD`, …) | GitHub `production`/`staging` environment secrets (decisions D1-A/D2-C). CI renders these lines into the server `.env` **secret subset** on each deploy — those lines are **CI-owned**; non-secret config stays operator-owned. Runbook: `docs/CI-CD.md` §Secret provisioning |

Prod image: `ghcr.io/smarterp-multitenant/smart-platform`. Pipeline flow, one-time VPS bootstrap, migration policy and rollback: see `docs/CI-CD.md`; per-environment source of truth: `docs/env-matrix.md`.
