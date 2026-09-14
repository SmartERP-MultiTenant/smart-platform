# i18n Decision — Bilingual Arabic + English

**Source:** ClickUp ticket [86cbbpyeu](https://app.clickup.com/t/86cbbpyeu) "[P1.2] i18n strategy decision + English locale" · decision dated 2026-09-01.

## Decision

**Option B — full locale-file i18n, bilingual AR + EN** (not hardcoded-Arabic single-locale).

## Configuration

- `next-i18next.config.js`: `locales: ['ar', 'en']`, `defaultLocale: 'ar'` (Arabic-first market; `/` serves Arabic, `/en/*` serves English), `localePath: ./locales`. `next.config.js` imports `i18n` from the same file.
- **Namespaces:** `common` (app shell + registration funnel + ERP subscription + shared chrome such as `switch-theme`, which is used by both the app-shell Header and the landing `LandingHeader`) and `marketing` (landing page copy — all `landing-*` keys). Landing components use `useTranslation('marketing')`; `LandingHeader` requests `useTranslation(['marketing', 'common'])`; the rest of the app uses `common`.
- Locale switching: `NEXT_LOCALE` cookie (1 year, `SameSite=Lax`) + `router.push(..., { locale })` via the shared `components/LanguageSwitcher.tsx` (landing header desktop + mobile, and a fixed corner switcher on `/pricing`, `/register`, `/payment/success`, `/payment/failed`).
- Directionality: `dir`/`lang` are dynamic per locale — `<Html lang dir>` in `pages/_document.tsx` (from `__NEXT_DATA__.locale`) and per-page wrappers. No hardcoded `dir="rtl" lang="ar"`.
- SEO: minimal `rel="canonical"` + `hreflang` (`ar`, `en`, `x-default` → ar) alternates in `_document.tsx`. Broader SEO work remains with the P4.10 SEO ticket.

## Rules

- New public pages must call `serverSideTranslations(locale, [namespaces...])` in `getServerSideProps` (fallback `'ar'` when locale is absent) and must be reachable when locale-prefixed (middleware strips `/ar|/en` before matching `unAuthenticatedRoutes`).
- Never hardcode user-facing strings in components; add keys to both `locales/ar/*.json` and `locales/en/*.json`.
- Arabic pluralization uses i18next plural suffixes (`_one`, `_two`, `_few`, `_many`, `_other`); English uses `_one`/`_other`.
