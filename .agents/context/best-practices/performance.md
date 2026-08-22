<!-- Context: best-practices/performance | Priority: high | Version: 1.0 | Updated: 2026-08-18 -->

# Performance — best practices (harvested from this codebase)

Purpose: keep the landing/funnel fast (CWV targets: LCP ≤ 2.5s, a11y ≥ 95) while adding design-system, pricing, and payment pages.

## Key points

- **Fonts are self-hosted via `next/font/google`** (Cairo, Montserrat, Tajawal, Almarai in `pages/design-system.tsx`). This removes render-blocking Google Fonts requests AND satisfies the strict CSP `font-src 'self'`. Never add a `<link>`/`@import` to fonts.googleapis.com — it both breaks CSP and hurts LCP.
- **Prisma client is a singleton** (`lib/prisma.ts`, cached on `global` in dev) — one connection per process, no connection churn per request. Keep this pattern; don't `new PrismaClient()` per handler.
- **Route handlers are lean:** `getServerSideProps` uses `serverSideTranslations(locale, ['common'])` only; heavy work (Prisma, auth) lives in server helpers (`lib/server-common.ts`), not client components. Keep client bundle small — lucide-react is tree-shaken (import named icons only).
- **The old app's failure mode (from `docs/audit/01-audit-report.md`):** 474 KiB JS bundle, 1.36 MB page weight, LCP 6.4s, unoptimized 532 KiB hero image. The redesign targets are the inverse: token-driven Tailwind (only used utilities in the CSS), optimized images, small first-load JS.
- **Images:** `next/image` with `remotePatterns` allowlist in `next.config.js` (boxyhq.com, files.stripe.com). New image hosts (logo, product screenshots, payment badges) must be added to `remotePatterns` — and should be local/optimized, not hot-linked.

## Rules for new code

1. Fonts via `next/font` only — no external font links (CSP + CWV).
2. Prisma through `lib/prisma.ts` singleton; batch queries, no N+1 in team listings.
3. Add external images to `next.config.js` `remotePatterns`; prefer `public/` for brand assets.
4. Keep `getServerSideProps` light — server-side data only, no heavy client imports.
5. Re-run Lighthouse after any new page; hold LCP ≤ 2.5s, CLS ≤ 0.1.

## References

- `styles/tokens.css` · `pages/design-system.tsx` (next/font usage) · `lib/prisma.ts` · `next.config.js` · `docs/audit/01-audit-report.md` (old baseline)
