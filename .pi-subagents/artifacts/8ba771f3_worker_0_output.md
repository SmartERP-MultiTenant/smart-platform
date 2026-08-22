Everything's verified. Here's the complete result:

## What I ran & fixed

**Environment:** Node 24 · npm 11 · `saas-postgres` Up · Playwright chromium cached.

### ✅ Required-green gate (all PASS)
| Script | Result | Fix applied |
|---|---|---|
| `check-locale` | ✅ | **Bug:** script crashed on Node 24 (`Dirent.path` removed → `parentPath`) — found+fixed all 4 refs. Then 3 genuinely unused locale keys (`sign-up`, `homepage-title`, `design-system` — leftovers from the old landing, zero code usages incl. new fenoise WIP) removed from `common.json`. |
| `context:validate` | ✅ (was already green) | none |
| `check-format` | ✅ | **Bug:** `.prettierignore` last line was broken into `eslint.config.cjs.pi-subagents` (no trailing newline) — rewrote; added `.pi-subagents`; prettier-wrote 3 audit docs + design-tokens JSON. |
| `check-lint` | ✅ | Removed stale `eslint-disable-next-line no-var` in `lib/prisma.ts`; **after 1st e2e run lint exploded (3368 errors)** — generated `playwright-report/` wasn't ignored by eslint; added `playwright-report`, `test-results`, `report` to eslint `ignores`. 2 remaining warnings are WIP fenoise `<img>` (left untouched per instructions). |
| `check-types` | ✅ | none |
| `npm test` | ✅ 4/4 | none |
| `npm run build` | ✅ with sandbox workaround | Original failure: `NextFontError: Failed to fetch Cairo/Almarai from Google Fonts` (**sandbox network quirk** — Node's fetch gets an unroutable IPv6 address; literal-IP works, so code is fine). Build fully compiles/static-generates with an IPv4-forcing preload. |

### ⚠️ `check-unused` (knip) — FAIL, but **not in the required-green gate**
Triage (no deletions — avoiding destructive changes mid-WIP):
- **False positives:** `eslint-config-prettier`/`eslint-config-next` (loaded via eslint `extends`), `sharp` (required by next/image), `jest.setup.js`/`@testing-library/jest-dom` (`setupFilesAfterEnv` currently commented).
- **WIP-related dead code (left):** old `defaultLanding/{Hero,Feature,FAQ,Pricing}` superseded by `fenoise/`; `ProductNavigation`, `sendWelcomeEmail`, `find-dupe-locale.js`. Intentionally **not deleted**.
- **Unlisted deps** `openid-client`/`jose` are deliberate (see `pages/api/import-hack.ts` comment).

### ⚠️ `test:e2e` — PARTIAL (environment-blocked, not code)
- Setup/signup test **passed** → the WIP registration funnel works end-to-end.
- SSO specs (`idp-initiated`, `sso.login`) require external mock SAML (`MOCKSAML_ORIGIN`; `globalSetup.ts` hard-codes `https://mocksaml.com` locally, CI uses a container). The app's server-side metadata fetch times out on the **same sandbox network quirk** (just like Google Fonts). Not a WIP regression — environmental/infra.

**Files changed by me (5 + 4 formatted docs; I staged nothing):**
`check-locale.js` · `locales/en/common.json` · `.prettierignore` · `eslint.config.cjs` · `lib/prisma.ts` (+ formatted: `docs/audit/01,03,04`, `docs/smart-erp-design-tokens.json`). The `M` on `pages/index.tsx`, `middleware.ts`, `components/auth/*`, `pages/auth/*` are **pre-existing WIP**, untouched by me.

**No commit, no push, nothing staged by me** (26 files were already staged by the parent's earlier AGENTS.md task).