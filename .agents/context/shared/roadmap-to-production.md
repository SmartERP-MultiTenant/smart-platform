<!-- Context: shared/roadmap-to-production | Priority: high | Version: 1.1 | Updated: 2026-08-30 -->

# Roadmap to production (2026-08-30)

Purpose: canonical state of the production gap for the SMART PLATFORM product family. Source-of-truth docs: `docs/ROADMAP-to-production.md` (gap analysis, 2026-08-29/30) and `docs/Roads/GO-LIVE-CHECKLIST.md` (launch gate). Tasks tracked in ClickUp space "SMART ERP SaaS" (see clickup-board.md).

## Key points

- **Baseline:** type-check green, CI (lint/jest/build/types/prisma/playwright) green, landing + registration + payment funnel wired e2e against ERP backend (local dev). Marketing shell + per-team admin only — **Platform Admin Dashboard is the biggest missing surface** (`pages/dashboard.tsx` is a redirect shell; `lib/erp.ts` `listSubscriptions` is ready-but-unused dead code).
- **Launch blockers (M1):** 1) payments: only card/mada/apple*pay→Moyasar real; Tabby/Tamara/HyperPay(STC Pay) are MOCKS (decision: flip to real or trim marketing claims); Moyasar key committed as `sk_test*...`→ live env keys; CSP must allow payment SDK iframes. 2) ERP`Platform:ApiKey`EMPTY ⇒ every`/api/platform/_`call 500s — set same key as`ERP_PLATFORM_API_KEY`on both sides. 3) SMTP empty ⇒ magic-link/welcome/password-reset don't deliver. 4) Prod env: NEXTAUTH_SECRET/URL, env matrix, vault.`prisma migrate deploy`is now part of the CD pipeline; the local`build`script still uses`db push`(dev-only). Dockerfile + entrypoint + full CI/CD pipeline added 2026-08-30 (GHCR image, SSH deploy job,`docker-compose.prod.yml`+`docker-compose.platform.override.yml`, docs/CI-CD.md) — **P4.3 pending operator bootstrap**: GitHub `production`secrets (SSH_HOST/USER/PRIVATE_KEY/KNOWN_HOSTS), smart-deploy user + GHCR PAT on VPS,`.env`chmod 600, service-key verification. 5) Wildcard DNS + TLS`_.smartapro.com` for tenant subdomains. 6) Sentry DSN empty; /api/health unmonitored.
- **Hardening (M2):** /terms + /privacy referenced in footer but 404; reCAPTCHA keys empty (only in-memory rate limiter); CSP has unsafe-inline/eval; tests thin (1 unit spec — need lib/erp.ts, zod, limiter units + Playwright funnel e2e); no robots/sitemap/OG/JSON-LD; `pages/teams/[slug]/products.tsx` placeholder; legacy `pages/api/import-hack.ts`+`password.ts`.
- **Decisions recorded (GO-LIVE):** Samsung Pay SKIPPED by owner (closed); JWT-in-URL handoff ACCEPTED for v1 (HTTPS mandatory, ~24h expiry, strict referrer; later POST auto-submit); erpAccessToken stored server-side, encrypt-at-rest DEFERRED to launch; dev M2M key `smpdev-billing-key-2026` must be deleted for prod; VAT number 310428442600003; WhatsApp number still placeholder; vuln scan findings OPEN: AutoMapper 13.0.1 (HIGH) + MailKit 4.6.0; kit Postgres + ERP SQL backups/restore drills not yet done.
- **Admin dashboard milestone:** build after M2M key (P5.1): super-admin role in platform RBAC (`lib/permissions.ts`+`lib/rbac.ts` cover team resources only today), `/admin` Arabic UI (tenants + subscription status + health), manual add/extend/cancel/trial, users screen, per-plan module toggles, revenue view. ERP-side SuperAdminService + PlatformBillingController already ported to `development` branch.

## Related

- `ecosystem-map.md` (repos) · `payments.md` (provider map) · `integration-contracts.md` · `team-workflow.md` · `clickup-board.md` (task tracking)
