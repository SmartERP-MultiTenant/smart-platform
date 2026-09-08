# Environment matrix — smart-platform

Single source of truth for every environment variable in `smart-platform`: which
environment each variable applies to (local / staging / production), where the value
comes from, how it is injected, and whether the production value is real, a
placeholder, or intentionally unset. **No live secret values live in this file or
anywhere in git** — secret cells carry source pointers only.

- **Ticket:** [P4.2] Production env matrix + vault-based secrets (<https://app.clickup.com/t/86cbbpykx>)
- **Change type:** doc-only (plus `.env.example` placeholder scrub — same PR)
- **Owner:** Mohamed (LEAD) · **Last audit:** 2026-09-07 · **Plan:** `PLAN-P4.2-env-matrix-vault.md` (v1.1)
- **Decision log:** D1–D6 signed off 2026-09-07 (vault = GitHub env secrets, hybrid push model,
  staging required, explicit feature flags, inherited vars flagged, `NEXT_PUBLIC_*` build-args
  deferred to P4.6).

## Table of contents

1. [How to read this file](#1-how-to-read-this-file)
2. [Environments overview](#2-environments-overview)
3. [The matrix](#3-the-matrix)
   - 3.1 [Core / runtime boot](#31-core--runtime-boot)
   - 3.2 [ERP integration (M2M)](#32-erp-integration-m2m)
   - 3.3 [Email / SMTP](#33-email--smtp)
   - 3.4 [Auth / signup / security](#34-auth--signup--security)
   - 3.5 [Feature flags](#35-feature-flags)
   - 3.6 [Behavior](#36-behavior)
   - 3.7 [Public URLs / client (build-time)](#37-public-urls--client-build-time)
   - 3.8 [Sentry / observability](#38-sentry--observability)
   - 3.9 [Conditional integrations](#39-conditional-integrations)
   - 3.10 [Inherited / unused (do not provision)](#310-inherited--unused-do-not-provision)
   - 3.11 [Non-app vars (compose / CI / Dockerfile)](#311-non-app-vars-compose--ci--dockerfile)
4. [Required on boot — per environment](#4-required-on-boot--per-environment)
5. [Cross-repo secrets](#5-cross-repo-secrets)
6. [Related docs & maintenance](#6-related-docs--maintenance)

## 1. How to read this file

**Columns.** One row per variable. `Local`, `Staging`, `Prod` = what the value is (or
where it comes from) in that environment. `Injection` = how the value reaches the app.
`Source` = who owns/supplies the value. `Status` = production readiness of the value.
`Notes` = semantics, gotchas, and cross-links.

**Source legend.**

| Token | Meaning                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [GHS] | GitHub **environment secret** (`ENV_<VAR>` under Settings → Environments → production/staging). CI renders these lines into the server `.env` on every deploy (decision D2-C — secret lines are **CI-owned**) |
| [SRV] | Server `.env` (`/var/www/multitenant-smart-and-pro/.env`, mode 600) — operator-owned **non-secret** config                                                                                                    |
| [LOC] | Local `.env` (gitignored, dev only)                                                                                                                                                                           |
| [DEF] | Code default (`lib/env.ts` / entrypoint / Next.js) — no value needed                                                                                                                                          |
| [OFF] | Intentionally disabled / not set                                                                                                                                                                              |

**Status legend.** `real` = genuine production value in use · `placeholder` = awaiting a
real value (staging holds placeholders by design, decision D3-A) · `optional` = code
default is fine · `off` = feature disabled · `inherited-unused` = upstream kit var, do
not provision (decision D5-A) · `conditional(<flag>)` = needed only when `<flag>` is
active.

**Injection legend.** `runtime` = read from the server environment at runtime · `build` =
`NEXT_PUBLIC_*`, **inlined into the client bundle at `next build`** — runtime `.env`
cannot change it · `both` = read server-side at runtime AND inlined client-side at build
(split-brain — see decision D6).

> Default-on trap (M2): `FEATURE_TEAM_*` flags and `NEXT_PUBLIC_DARK_MODE` use
> `!== 'false'` semantics — **unset means enabled**. Production rows below therefore
> carry explicit values; an empty cell would mean _on_.
>
> ".env.example contains no real values" means no credentials/secrets — local URLs and
> flags there are legitimate (rule 10, plan §4.2).

## 2. Environments overview

|                    | Local                       | Staging                                                                                                             | Production                                                                      |
| ------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Target**         | dev machine (`npm run dev`) | VPS second compose project (decision D3-A — **not yet created**; same host `204.44.87.208`, distinct ports/aliases) | VPS integrated stack (`/var/www/multitenant-smart-and-pro`, service `platform`) |
| **Base URL**       | <http://localhost:4002>     | `https://staging.smartapro.com` (TBD with DNS, P4.5)                                                                | <https://platform.smartapro.com>                                                |
| **Deploy trigger** | —                           | GitHub Actions `staging` environment (to be wired, plan step 8)                                                     | GitHub Actions `production` environment (main push / `workflow_dispatch`)       |
| **Secrets**        | `.env` (gitignored)         | GitHub env secrets `ENV_*` — placeholders until provisioned                                                         | GitHub env secrets `ENV_*` — real values                                        |
| **Health check**   | —                           | TBD (mirror prod)                                                                                                   | `http://127.0.0.1:5032/api/health` → `db.ok=true`                               |

> **`.env.e2e` — a 4th provisioned env** (test only): Playwright end-to-end runs. Shadows
> `EMAIL_ENABLED=false` (Mailpit recipe, `docs/CI-CD.md`), adds `JACKSON_*` +
> `MOCKSAML_ORIGIN`, and drops ERP URLs, OAuth pairs, `NEXT_PUBLIC_*`, `STRIPE_*`,
> `SVIX_*`, `RETRACED_*`, Sentry and `MAX_LOGIN_ATTEMPTS` (see `.env.e2e`).

## 3. The matrix

### 3.1 Core / runtime boot

| Var                         | Local                                                    | Staging                           | Prod                                 | Injection | Source             | Status   | Notes                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------- | --------------------------------- | ------------------------------------ | --------- | ------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXTAUTH_URL`              | <http://localhost:4002>                                  | placeholder (staging URL)         | <https://platform.smartapro.com>     | runtime   | [LOC] + [SRV]      | real     | Canonical NextAuth URL; must match `APP_URL` scheme/host                                                                                                                           |
| `NEXTAUTH_SECRET`           | [LOC] dev-only value                                     | [GHS:staging ENV_NEXTAUTH_SECRET] | [GHS:production ENV_NEXTAUTH_SECRET] | runtime   | [LOC] + [GHS]      | real     | ≥32 random chars (`openssl rand -base64 32`), **unique per env** (A4); rotation invalidates sessions                                                                               |
| `NEXTAUTH_SESSION_STRATEGY` | jwt                                                      | jwt                               | jwt                                  | runtime   | [LOC] + [DEF]      | optional | Code default `jwt` (lib/env.ts:36); CI/e2e overrides to `database` for tests                                                                                                       |
| `APP_URL`                   | <http://localhost:4002>                                  | placeholder (staging URL)         | <https://platform.smartapro.com>     | runtime   | [LOC] + [SRV]      | real     | Absolute base for links/redirects (lib/env.ts:5)                                                                                                                                   |
| `DATABASE_URL`              | postgresql://postgres:postgres@localhost:5433/saas (dev) | [GHS:staging ENV_DATABASE_URL]    | [GHS:production ENV_DATABASE_URL]    | runtime   | [LOC] + [GHS]      | real     | **Contains credentials — secret, never in git.** Prod must use the Compose network hostname `postgres:5432`, **not** `localhost:5433` (unreachable in-container)                   |
| `PORT`                      | [DEF] 4002                                               | 4002 ([SRV])                      | 4002 ([SRV])                         | runtime   | [SRV] + [DEF]      | real     | Container listen port (docker-entrypoint.sh default 4002; Dockerfile:43). Missing from `.env.example` — compose-level var, add there on next example refresh                       |
| `PLATFORM_IMAGE_TAG`        | —                                                        | deploy-managed ([SRV])            | deploy-managed ([SRV])               | runtime   | [SRV] (deploy job) | real     | GHCR tag (`sha-<40 hex>` / `latest`); the deploy job sets it idempotently. Not an app var; server-only                                                                             |
| `SECURITY_HEADERS_ENABLED`  | [DEF] off                                                | off                               | off (until security lane opts in)    | runtime   | [DEF]              | optional | lib/env.ts:7 — default **off** (`?? false`); missing from `.env.example`. Security headers/CSP itself is enforced in `middleware.ts` regardless (see `best-practices/security.md`) |

### 3.2 ERP integration (M2M)

| Var                     | Local                                                                           | Staging                                                                   | Prod                                      | Injection | Source        | Status   | Notes                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- | --------- | ------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ERP_API_URL`           | [LOC] dev ERP API URL                                                           | placeholder (ERP lane provides staging URL)                               | [SRV] real ERP API URL                    | runtime   | [LOC] + [SRV] | real     | SmartERP WebAPI base (lib/env.ts:11); value lives in the ERP lane's DNS/env matrix                                                                                                     |
| `ERP_CLIENT_URL`        | [LOC] dev ERP client URL                                                        | placeholder                                                               | [SRV] real ERP client URL                 | runtime   | [LOC] + [SRV] | real     | ERP front-end base (lib/env.ts:12)                                                                                                                                                     |
| `ERP_CLIENT_LOGIN_PATH` | [DEF] `/auth/login`                                                             | `/auth/login`                                                             | `/auth/login`                             | runtime   | [DEF] + [SRV] | optional | Overridable per env (lib/env.ts:13)                                                                                                                                                    |
| `ERP_BASE_DOMAIN`       | smartapro.com                                                                   | smartapro.com                                                             | smartapro.com                             | runtime   | [DEF] + [SRV] | real     | Shared cookie/session domain with ERP (lib/env.ts:14); public domain, non-secret                                                                                                       |
| `ERP_ADMIN_USERNAME`    | [LOC] dev-seed admin (anonymized in `.env.example` 2026-09-07 — decision D-OWN) | placeholder                                                               | [GHS:production ENV_ERP_ADMIN_USERNAME]   | runtime   | [LOC] + [GHS] | real     | ERP SuperAdmin service account identifier (extend/cancel ops). Not a password but sensitive — keep in vault; real value only in GitHub env secret, never in `.env.example`             |
| `ERP_ADMIN_PASSWORD`    | [LOC] dev-seed (scrubbed from `.env.example` 2026-09-07)                        | [GHS:staging ENV_ERP_ADMIN_PASSWORD]                                      | [GHS:production ENV_ERP_ADMIN_PASSWORD]   | runtime   | [LOC] + [GHS] | real     | Secret — never in git/ClickUp/logs                                                                                                                                                     |
| `ERP_PLATFORM_API_KEY`  | [LOC] dev M2M key                                                               | [GHS:staging ENV_ERP_PLATFORM_API_KEY] (generate per-env, coordinate ERP) | [GHS:production ENV_ERP_PLATFORM_API_KEY] | runtime   | [LOC] + [GHS] | real     | **Cross-repo M2M secret** — must equal ERP `Platform:ApiKey` (`SmartAndPro.ERP.Inventory/SmartAndPro.ERP.WebAPI/appsettings.json:131`). Rotation is coordinated on both sides (see §5) |

### 3.3 Email / SMTP

| Var             | Local               | Staging                                     | Prod                               | Injection | Source                  | Status | Notes                                                                                                                                   |
| --------------- | ------------------- | ------------------------------------------- | ---------------------------------- | --------- | ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `EMAIL_ENABLED` | true (dev)          | true (placeholder SMTP)                     | true                               | runtime   | [SRV] (deploy enforces) | real   | Explicit email gate (lib/env.ts:25, `=== 'true'` → off by default). Deploy adds `true` idempotently; `.env.e2e` shadows false (Mailpit) |
| `SMTP_HOST`     | [LOC] Mailpit/local | placeholder (staging SMTP host)             | [SRV] real SMTP host               | runtime   | [LOC] + [SRV]           | real   | P4.1 lane supplies prod values                                                                                                          |
| `SMTP_PORT`     | [LOC]               | placeholder                                 | [SRV] real port                    | runtime   | [LOC] + [SRV]           | real   |                                                                                                                                         |
| `SMTP_USER`     | [LOC]               | [GHS:staging ENV_SMTP_USER] placeholder     | [GHS:production ENV_SMTP_USER]     | runtime   | [LOC] + [GHS]           | real   | Secret when the provider uses auth; else empty + note in runbook                                                                        |
| `SMTP_PASSWORD` | [LOC]               | [GHS:staging ENV_SMTP_PASSWORD] placeholder | [GHS:production ENV_SMTP_PASSWORD] | runtime   | [LOC] + [GHS]           | real   | Secret                                                                                                                                  |
| `SMTP_FROM`     | [LOC]               | placeholder                                 | [SRV] real from-address            | runtime   | [LOC] + [SRV]           | real   | Non-secret; shown in recipients                                                                                                         |

### 3.4 Auth / signup / security

| Var                                 | Local       | Staging                                            | Prod                                                                           | Injection | Source        | Status      | Notes                                                                                                                            |
| ----------------------------------- | ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------ | --------- | ------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_PROVIDERS`                    | credentials | credentials                                        | credentials (+ github/google **only** when their client pairs are provisioned) | runtime   | [LOC] + [SRV] | real        | lib/env.ts:100 default is `github,credentials` — an unset var would surface a broken GitHub button. Keep the prod value explicit |
| `CONFIRM_EMAIL`                     | false       | false                                              | false (revisit with P4.1 email flow)                                           | runtime   | [LOC] + [SRV] | optional    | `=== 'true'` → on (lib/env.ts:90)                                                                                                |
| `DISABLE_NON_BUSINESS_EMAIL_SIGNUP` | false       | false                                              | false (business policy TBD)                                                    | runtime   | [LOC] + [SRV] | optional    | `=== 'true'` → on (lib/env.ts:98)                                                                                                |
| `MAX_LOGIN_ATTEMPTS`                | 5           | 5                                                  | 5                                                                              | runtime   | [DEF]         | optional    | Account-lockout threshold (lib/env.ts:130)                                                                                       |
| `RECAPTCHA_SITE_KEY`                | empty (off) | placeholder (staging test keys)                    | [SRV]/[GHS] real when enabled                                                  | runtime   | [LOC] + [GHS] | placeholder | Public site key; enable with `RECAPTCHA_SECRET_KEY` together                                                                     |
| `RECAPTCHA_SECRET_KEY`              | empty (off) | [GHS:staging ENV_RECAPTCHA_SECRET_KEY] placeholder | [GHS:production ENV_RECAPTCHA_SECRET_KEY]                                      | runtime   | [LOC] + [GHS] | placeholder | Secret — never in git                                                                                                            |

### 3.5 Feature flags

All rows: `runtime` injection, default-on `!== 'false'` semantics (unset = **enabled**), so
every environment sets explicit values. Prod values follow decision **D4-A**.

| Var                      | Local | Staging | Prod      | Injection | Source | Status | Notes                                                                                                                                      |
| ------------------------ | ----- | ------- | --------- | --------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `FEATURE_TEAM_SSO`       | true  | true    | true      | runtime   | [SRV]  | real   | Enterprise SSO/SAML UI (lib/env.ts:111); SAML backend vars are conditional — see §3.9                                                      |
| `FEATURE_TEAM_DSYNC`     | true  | true    | true      | runtime   | [SRV]  | real   | SCIM directory sync (lib/env.ts:112)                                                                                                       |
| `FEATURE_TEAM_AUDIT_LOG` | true  | true    | true      | runtime   | [SRV]  | real   | Audit-log UI (lib/env.ts:115); provider vars unused — §3.10                                                                                |
| `FEATURE_TEAM_WEBHOOK`   | true  | true    | true      | runtime   | [SRV]  | real   | Webhook UI (lib/env.ts:113); provider vars unused — §3.10                                                                                  |
| `FEATURE_TEAM_API_KEY`   | true  | true    | true      | runtime   | [SRV]  | real   | Team API keys (lib/env.ts:114)                                                                                                             |
| `FEATURE_TEAM_DELETION`  | true  | true    | true      | runtime   | [SRV]  | real   | Team deletion (lib/env.ts:122)                                                                                                             |
| `FEATURE_TEAM_PAYMENTS`  | false | false   | **false** | runtime   | [SRV]  | real   | **D4-A: false until the Moyasar/Tabby/Tamara wiring lands.** Double-gated with Stripe keys (lib/env.ts:116-120) — keys stay off too (§3.9) |

### 3.6 Behavior

| Var                     | Local                      | Staging         | Prod                       | Injection | Source                                    | Status | Notes                                                                                                                                                |
| ----------------------- | -------------------------- | --------------- | -------------------------- | --------- | ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HIDE_LANDING_PAGE`     | false                      | false           | false                      | runtime   | [SRV]                                     | real   | Landing served at `/` (lib/env.ts:106, `=== 'true'` hides it)                                                                                        |
| `GROUP_PREFIX`          | smart-platform-            | smart-platform- | smart-platform-            | runtime   | [DEF] + [SRV]                             | real   | SSO group prefix (lib/env.ts:67)                                                                                                                     |
| `NEXT_PUBLIC_DARK_MODE` | false                      | false           | false (explicit)           | **build** | [LOC] + [SRV at build]                    | real   | Default-on trap: unset = **dark mode on**. Build-time (D6): current GHCR images bake the default-on state — visible only after P4.6 build-arg wiring |
| `PLATFORM_ADMIN_EMAIL`  | not set (script flag wins) | not set         | **not set in prod `.env`** | runtime   | script (`scripts/seed-platform-admin.ts`) | off    | Seed-only target for `npm run seed:platform-admin -- --email …` (P5.2); example only — never a real committed admin email                            |

### 3.7 Public URLs / client (build-time)

| Var                          | Local    | Staging  | Prod                                         | Injection | Source                 | Status      | Notes                                                                              |
| ---------------------------- | -------- | -------- | -------------------------------------------- | --------- | ---------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_TERMS_URL`      | /terms   | /terms   | /terms                                       | **build** | [DEF] fallback         | optional    | Code fallback `/terms` (AgreeMessage.tsx:13); public URL swap needs a rebuild (D6) |
| `NEXT_PUBLIC_PRIVACY_URL`    | /privacy | /privacy | /privacy                                     | **build** | [DEF] fallback         | optional    | Code fallback `/privacy` (AgreeMessage.tsx:22)                                     |
| `NEXT_PUBLIC_SUPPORT_URL`    | empty    | empty    | real support URL when help desk ready (P4.x) | **build** | [DEF] fallback `''`    | placeholder | Empty fallback renders no support link (Help.tsx:19); bake via P4.6 build args     |
| `NEXT_PUBLIC_MIXPANEL_TOKEN` | empty    | empty    | real token when analytics is approved        | **build** | [LOC] + [GHS at build] | placeholder | Public client token (lib/env.ts:94); build-time only (D6)                          |

### 3.8 Sentry / observability

Decision **D6-A**: build-arg wiring deferred to P4.6 (Sentry lane). Until then the client
bundle is **inert** — server-side runtime reads still activate. `next.config.js` has no
Sentry wrapper today.

| Var                                    | Local               | Staging                                         | Prod                                         | Injection        | Source                        | Status      | Notes                                                                                                                                    |
| -------------------------------------- | ------------------- | ----------------------------------------------- | -------------------------------------------- | ---------------- | ----------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SENTRY_DSN`               | empty (off)         | empty (off)                                     | real DSN provisioned by P4.6                 | **both**         | [LOC] + [GHS at build] (P4.6) | placeholder | Client init reads at **build** (sentry.client.config.ts:4); server init at runtime (instrumentation.ts:11). DSN is public — safe to bake |
| `NEXT_PUBLIC_SENTRY_TRACE_SAMPLE_RATE` | empty (default 0.0) | empty                                           | e.g. 0.1, set by P4.6                        | **both**         | [LOC] + [GHS at build] (P4.6) | placeholder | Default `0.0` (sentry.client.config.ts:6 / instrumentation.ts:13)                                                                        |
| `SENTRY_RELEASE`                       | —                   | —                                               | image tag (`sha-<40 hex>`) when wired (P4.6) | runtime          | deploy-provided               | placeholder | SDK-conventional; not read by app source yet                                                                                             |
| `SENTRY_ENVIRONMENT`                   | development         | staging                                         | production                                   | runtime          | [SRV]                         | placeholder | SDK-conventional; inert until P4.6                                                                                                       |
| `SENTRY_URL`                           | —                   | —                                               | real SaaS URL when wired                     | build-time (CLI) | [SRV]                         | placeholder | Sentry CLI convention; inert until P4.6                                                                                                  |
| `SENTRY_ORG`                           | —                   | —                                               | real org slug (P4.6)                         | build-time (CLI) | [SRV]                         | placeholder |                                                                                                                                          |
| `SENTRY_PROJECT`                       | —                   | —                                               | real project slug (P4.6)                     | build-time (CLI) | [SRV]                         | placeholder |                                                                                                                                          |
| `SENTRY_AUTH_TOKEN`                    | empty               | [GHS:staging ENV_SENTRY_AUTH_TOKEN] placeholder | [GHS:production ENV_SENTRY_AUTH_TOKEN]       | build-time (CLI) | [LOC] + [GHS]                 | placeholder | **Secret.** Upload/auth token for source-map upload; provision only when P4.6 lands                                                      |

### 3.9 Conditional integrations

| Var                      | Local                          | Staging                                              | Prod                                                                                                          | Injection | Source                      | Status                             | Notes                                                              |
| ------------------------ | ------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- | --------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `GITHUB_CLIENT_ID`       | empty (off — credentials auth) | empty                                                | empty until GitHub provider is enabled in `AUTH_PROVIDERS`                                                    | runtime   | [LOC] + [GHS when enabled]  | conditional(AUTH_PROVIDERS)        | Public client id; secret pair below                                |
| `GITHUB_CLIENT_SECRET`   | empty                          | [GHS:staging ENV_GITHUB_CLIENT_SECRET] placeholder   | [GHS:production ENV_GITHUB_CLIENT_SECRET]                                                                     | runtime   | [LOC] + [GHS]               | conditional(AUTH_PROVIDERS)        | Secret                                                             |
| `GOOGLE_CLIENT_ID`       | empty (off)                    | empty                                                | empty until Google provider enabled                                                                           | runtime   | [LOC] + [GHS when enabled]  | conditional(AUTH_PROVIDERS)        |                                                                    |
| `GOOGLE_CLIENT_SECRET`   | empty                          | [GHS:staging ENV_GOOGLE_CLIENT_SECRET] placeholder   | [GHS:production ENV_GOOGLE_CLIENT_SECRET]                                                                     | runtime   | [LOC] + [GHS]               | conditional(AUTH_PROVIDERS)        | Secret                                                             |
| `JACKSON_URL`            | [LOC] dev SAML service         | empty                                                | empty until an SSO/SAML backend is deployed (FEATURE_TEAM_SSO=true but no Jackson service in the stack today) | runtime   | [LOC] + [GHS when deployed] | conditional(FEATURE_TEAM_SSO)      | lib/env.ts:71; commented placeholders in `.env.example` only       |
| `JACKSON_EXTERNAL_URL`   | [LOC]                          | empty                                                | empty (ditto)                                                                                                 | runtime   | [LOC] + [GHS when deployed] | conditional(FEATURE_TEAM_SSO)      | lib/env.ts:72                                                      |
| `JACKSON_API_KEY`        | [LOC]                          | [GHS:staging ENV_JACKSON_API_KEY] placeholder        | [GHS:production ENV_JACKSON_API_KEY]                                                                          | runtime   | [LOC] + [GHS]               | conditional(FEATURE_TEAM_SSO)      | Secret (lib/env.ts:73; delete-team.js:36). CI supplies test values |
| `JACKSON_PRODUCT_ID`     | [LOC]                          | placeholder                                          | real product id when deployed                                                                                 | runtime   | [LOC] + [SRV]               | conditional(FEATURE_TEAM_SSO)      | lib/env.ts:74                                                      |
| `JACKSON_WEBHOOK_SECRET` | [LOC]                          | [GHS:staging ENV_JACKSON_WEBHOOK_SECRET] placeholder | [GHS:production ENV_JACKSON_WEBHOOK_SECRET]                                                                   | runtime   | [LOC] + [GHS]               | conditional(FEATURE_TEAM_SSO)      | Secret (lib/env.ts:85)                                             |
| `STRIPE_SECRET_KEY`      | empty (payments off)           | empty                                                | empty — payments stack decision is Moyasar/Tabby/Tamara; Stripe vars stay unused                              | runtime   | [LOC] + [GHS]               | conditional(FEATURE_TEAM_PAYMENTS) | Secret (lib/env.ts:120,135; sync-stripe.js)                        |
| `STRIPE_WEBHOOK_SECRET`  | empty                          | empty                                                | empty (ditto)                                                                                                 | runtime   | [LOC] + [GHS]               | conditional(FEATURE_TEAM_PAYMENTS) | Secret (lib/env.ts:136)                                            |

### 3.10 Inherited / unused (do not provision)

Decision **D5-A**: upstream kit variables, present in `.env.example` but with no provider
backend in this deployment. Keep them listed and flagged; **do not provision** real
values. Pruning is a separate refactor ticket (BACKEND-KIT lane).

| Var                                   | Status                 | Notes                                                                                                                       |
| ------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `SVIX_URL`                            | inherited-unused       | Webhook provider (Svix) not deployed (lib/env.ts:42-43 reads only when `FEATURE_TEAM_WEBHOOK` UI is used against a backend) |
| `SVIX_API_KEY`                        | inherited-unused       | Secret class — keep empty                                                                                                   |
| `RETRACED_URL`                        | inherited-unused       | Audit provider (Retraced) not deployed (lib/env.ts:60-64)                                                                   |
| `RETRACED_API_KEY`                    | inherited-unused       | Secret class — keep empty                                                                                                   |
| `RETRACED_PROJECT_ID`                 | inherited-unused       |                                                                                                                             |
| `OTEL_PREFIX`                         | inherited-unused       | Default `smart-platform.saas` (lib/env.ts:103); no OTel collector configured                                                |
| `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` | inherited-unused       | OTel SDK env convention — not read by app source                                                                            |
| `OTEL_EXPORTER_OTLP_METRICS_HEADERS`  | inherited-unused       | Secret class if ever used — keep empty                                                                                      |
| `SLACK_WEBHOOK_URL`                   | conditional(CI notify) | GitHub Actions `notify` job only (workflow secret, optional); also read at lib/env.ts:132 but unused by app code today      |
| `MOCKSAML_ORIGIN`                     | off (CI-only)          | Mock SAML for tests; not a runtime app var                                                                                  |

### 3.11 Non-app vars (compose / CI / Dockerfile)

Not app runtime variables — listed for completeness so nobody provisions them as app vars.

| Var                                                                      | Where                                                              | Status             | Notes                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB`                    | docker-compose.yml (dev), docker-compose.prod.yml (standalone ref) | off (compose-only) | Dev defaults; prod DB lives in the integrated stack                                                           |
| mocksaml `APP_URL` / `ENTITY_ID` / `PUBLIC_KEY` / `PRIVATE_KEY`          | dev compose + CI service env                                       | off (test-only)    | Test keypair is **committed** in `.github/workflows/main.yml` — flag for the P4.4 gitleaks whitelist decision |
| `NODE_ENV` / `NEXT_TELEMETRY_DISABLED` / `NODE_OPTIONS`                  | Dockerfile                                                         | off (build/run)    | Image build/run controls                                                                                      |
| CI env block vars (`DATABASE_URL`, `NEXTAUTH_SECRET`, flags, `DEBUG`, …) | `.github/workflows/main.yml` ci job                                | off (CI-only)      | Test values; mirror of the matrix for e2e parity                                                              |

## 4. Required on boot — per environment

What the deploy guard / operator must verify before the app is healthy (mirrors
`docs/CI-CD.md` bootstrap + plan §5.2 render-env).

**Local (`npm run dev`)**

- `NEXTAUTH_URL` / `APP_URL` = <http://localhost:4002> · `DATABASE_URL` = dev Postgres
  (host port 5433) · `NEXTAUTH_SECRET` present (dev value, ≥32 chars) ·
  `AUTH_PROVIDERS=credentials` · feature flags explicit (all true, payments false) ·
  `EMAIL_ENABLED=true` (Mailpit) or false.

**Staging (D3-A — to be bootstrapped, plan steps 8-9)**

- GitHub `staging` environment exists with `ENV_*` secrets (placeholders accepted for
  SMTP/recaptcha/Sentry; **NEXTAUTH_SECRET and ERP M2M key must be real and per-env**).
- Second compose project on the VPS: distinct ports/aliases/volumes; `.env` mode 600.
- Guard fails closed if any required `ENV_*` name is missing (names only, never values).

**Production (current + post-render-env)**

- Server `.env` (mode 600) with `DATABASE_URL` using the compose hostname
  `postgres:5432` (never `localhost:5433`) · `NEXTAUTH_URL`/`APP_URL` =
  <https://platform.smartapro.com> · `PORT=4002` · `PLATFORM_IMAGE_TAG` (deploy-managed) ·
  `EMAIL_ENABLED=true` (deploy enforces) · `ERP_*` family real · secret lines rendered by
  CI from `[GHS:production ENV_*]` on each deploy (D2-C) · health poll
  `db.ok=true` before the swap is accepted.

## 5. Cross-repo secrets

`ERP_PLATFORM_API_KEY` is shared with the ERP repo — the single most dangerous rotation
in this system.

- **Source of truth:** GitHub environment secret `ENV_ERP_PLATFORM_API_KEY`
  (production), mirrored as `Platform:ApiKey` in
  `SmartAndPro.ERP.Inventory/SmartAndPro.ERP.WebAPI/appsettings.json` (line 131, or its
  env override `Platform__ApiKey`).
- **Verification (2026-09-06):** both sides identical (64-hex).
- **Rotation rule:** rotate **both sides in the same maintenance window**, then verify a
  live platform→ERP call before closing the window. Never rotate one side only.
- **Never** paste the key in ClickUp, commits, logs, or this matrix.

Full rotation procedure + provisioning runbook: `docs/CI-CD.md` (secret provisioning
section, added by P4.2).

## 6. Related docs & maintenance

- `docs/CI-CD.md` — pipeline, GitHub secrets, one-time VPS bootstrap, and the
  **provisioning runbook** (per env) added by this ticket.
- `.agents/context/lookup/env-vars.md` — local-dev mirror of this matrix (kept in sync
  with it; AGENTS.md §2 context-sync rule).
- `.env.example` — key reference + placeholders only (no real values; scrub happened in
  this ticket, step 2).
- Tickets: P4.1 SMTP (prod SMTP values) · P4.4 secrets rotation + gitleaks (final secret
  set + sweep) · P4.5 nginx/TLS (staging DNS + cert runbook) · P4.6 Sentry (build-arg
  wiring, decision D6) · P4.12 GO/NO-GO (vault sign-off item 4.3).

**Maintenance rule:** adding/removing/renaming an env var requires touching, in the same
PR: `lib/env.ts` (if code reads it), `.env.example`, this matrix, and
`.agents/context/lookup/env-vars.md`. Doc-only changes need `npm run check-format` +
`check-locale` green; env-plumbing changes add the full A5 gate
(`check-types`, `check-lint`, `npm test`).
