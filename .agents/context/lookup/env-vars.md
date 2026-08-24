<!-- Context: lookup/env-vars | Priority: medium | Version: 1.0 | Updated: 2026-08-20 -->

# Environment variables (.env)

Read through the single config object in `lib/env.ts` (plain `process.env` reads — no zod validation). Values below are the **local dev** ones in `.env`.

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
| `RECAPTCHA_SITE_KEY` / `RECAPTCHA_SECRET_KEY` | empty (off)                                                                                                       |

## Feature flags

| Key                                                                                  | Note                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `FEATURE_TEAM_SSO` / `_DSYNC` / `_AUDIT_LOG` / `_WEBHOOK` / `_API_KEY` / `_DELETION` | true (enterprise pages enabled)                                     |
| `FEATURE_TEAM_PAYMENTS`                                                              | false locally (Stripe keys empty — enable only when wiring billing) |

## Integrations (empty locally)

`SVIX_URL/API_KEY` (webhooks) · `RETRACED_URL/API_KEY/PROJECT_ID` (audit) · `STRIPE_SECRET_KEY/WEBHOOK_SECRET` · `SLACK_WEBHOOK_URL` · GitHub/Google OAuth ids · Sentry (`NEXT_PUBLIC_SENTRY_DSN`, …) · Mixpanel token.

## Behavior toggles

| Key                     | Note                          |
| ----------------------- | ----------------------------- |
| `HIDE_LANDING_PAGE`     | false — landing served at `/` |
| `GROUP_PREFIX`          | smart-platform- (SSO group prefix) |
| `NEXT_PUBLIC_DARK_MODE` | false                         |
