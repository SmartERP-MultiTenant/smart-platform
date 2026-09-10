# PR #56 — decision record

Source of truth for decisions referenced by the ClickUp acceptance criteria for the
registration-funnel / platform-admin batch. The GitHub PR description links here.

Verified against the code on the `fix-platform-frontend-issues` branch (PR head `1254032`)
plus the review-fix branch. Where a decision needs a human, it is marked
**owner input required** rather than guessed.

## 1. Ticket coverage map

| Ticket      | Title                                            | Phase   | Primary files                                                                                                                                                                                         |
| ----------- | ------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `86cbbpyn5` | SEO: `robots.txt`, sitemap, OG tags, JSON-LD     | P4 · W3 | `public/robots.txt`, `public/sitemap.xml`, `public/og-image.png`, `components/shared/SEO.tsx`, `pages/index.tsx`, `pages/_document.tsx`, `middleware.ts`                                              |
| `86cbbpyey` | Contact CTA: real form or WhatsApp/email         | P1 · W2 | `components/defaultLanding/fenoise/{TrustStrip,MobileSection,FooterSection,FenoiseHeader}.tsx`, `components/shared/shell/Header.tsx`, `.env.example`, `lib/env.ts`, `Dockerfile`                      |
| `86cbbpypz` | Revenue view: subscriptions + trial expirations  | P5 · W3 | `lib/adminRevenue.ts`, `pages/api/admin/revenue.ts`, `pages/admin/revenue.tsx`, `components/admin/{AdminNav,AdminRevenueTable}.tsx`, `hooks/useAdminRevenue.ts`, `__tests__/lib/adminRevenue.spec.ts` |
| `86cbbpyfq` | Placeholder page + legacy API route cleanup      | P1 · W3 | `pages/api/password.ts`, `pages/teams/[slug]/products.tsx` (see §2)                                                                                                                                   |
| `86cbbpym5` | Legal pages: Terms, Privacy, KSA VAT/refund      | P4 · W2 | `pages/terms.tsx`, `pages/privacy.tsx`, `locales/{ar,en}/common.json`, `middleware.ts`                                                                                                                |
| `86cbbpyez` | Navigation decision: `/auth/join` vs `/register` | P1 · W3 | `docs/navigation-decision.md`, `components/shared/shell/{Header,TeamNavigation}.tsx`                                                                                                                  |
| `86cbbpyk3` | Team billing page polish + module list           | P3      | `pages/teams/[slug]/erp.tsx`, `components/shared/ConfirmationDialog.tsx`                                                                                                                              |

## 2. P1.4 — legacy cleanup decisions (`86cbbpyfq`)

Two decisions were explicitly required to be recorded. Both are recorded here.

### 2.1 `pages/api/import-hack.ts` — out of scope for this PR

This file is **not modified by this PR** (`git diff origin/main...HEAD -- pages/api/import-hack.ts`
is empty). It is a pre-existing upstream build workaround: it imports `openid-client` and
`jose` only so that Next.js keeps those packages resolvable in `node_modules` after a
production build (the import exists purely for its side effect on bundling; the handler
returns `{}` and the imported bindings are deliberately unused).

Decision: **leave it in place, unchanged.** Deleting it risks breaking the SSO/Jackson lane
at build time, it is unrelated to the placeholder-page cleanup, and it carries no runtime
behaviour. It is out of scope for `86cbbpyfq`; if the team wants it removed, that belongs in
a dedicated cleanup task with a production build to verify against.

### 2.2 `pages/api/password.ts` — `ApiError` import corrected

Changed import:

```
- import { ApiError } from 'next/dist/server/api-utils';
+ import { ApiError } from '@/lib/errors';
```

Why this matters — it was a real bug, and the mechanism is specific. The route's own catch
block reports the status by reading the property `status`:

```js
const status = error.status || 500;
```

Next.js's internal error class (from `next/dist/server/api-utils`) sets **`statusCode`**, not
`status`. Confirmed directly against the installed Next 15.5.14:

```
new NextApiError(400, '…')  ->  .status = undefined | .statusCode = 400
                                error.status || 500  =>  500   // wrong
new LocalApiError(400, '…') ->  .status = 400
                                error.status || 500  =>  400   // correct
```

So `throw new ApiError(400, 'Your current password is incorrect')` — a genuine client error —
was answered to the browser as **HTTP 500**. Switching to `@/lib/errors` (the repo-wide class,
which sets `status`) makes it a 400 again. Two secondary benefits: the deep
`next/dist/server/...` internal path is unsupported and can move between Next releases, and
the route now shares the error class used by `lib/rbac.ts`, `lib/recaptcha.ts`,
`lib/guards/*`, and `lib/guardPlatformAdmin.ts`.

Note: `validateWithSchema` (`lib/zod/index.ts`) already threw the local `ApiError` (422), so
only the wrong-password path was mis-reported.

## 3. P4.10 — `/payment/*` deliberately excluded from the sitemap (`86cbbpyn5`)

`public/sitemap.xml` contains no entry for `/payment/success` or `/payment/failed`, even
though the ticket's URL list mentioned them. This is intentional:

- Both pages set `noIndex` — `pages/payment/success.tsx` and `pages/payment/failed.tsx` pass
  `noIndex={true}` to `components/shared/SEO.tsx`, which renders `robots: noindex, nofollow`.
- `public/robots.txt` does not merely omit them, it disallows the whole prefix:
  `Disallow: /payment/`.

The ticket was self-contradictory: it asked for the same URLs to be both `noindex` and listed
in the sitemap, which search engines treat as conflicting signals. The SEO-correct subset was
shipped — 10 URLs covering `/`, `/pricing`, `/register`, `/terms`, `/privacy` (Arabic plus
the `/en` variants), each with `hreflang` alternates for `ar`, `en`, and `x-default`.
Listing a `noindex` URL in a sitemap would have produced avoidable Search Console warnings,
so the implementation followed the `noindex`/`robots.txt` intent and dropped the sitemap
entries.

Related note for the same ticket: the three SEO files above only reach crawlers because the
`middleware.ts` allowlist now exempts `/robots.txt`, `/sitemap.xml`, and `/og-image.*`. Any
future public static asset added to `public/` must be added to that allowlist too, or the
auth middleware redirects anonymous requests to `/auth/login`.

## 4. P5.7 — staging cross-check procedure (`86cbbpypz`)

Run this before closing the ticket. It compares what the platform renders against the ERP's
own view of the same tenants.

**Inputs**

| What              | Value                                                                 |
| ----------------- | --------------------------------------------------------------------- |
| Platform endpoint | `GET /api/admin/revenue` (platform admin session required)            |
| ERP M2M route     | `GET /platform/billing/subscriptions` with header `X-Platform-ApiKey` |
| Platform env      | `ERP_API_URL` (full M2M base URL, e.g. `http://localhost:5001/api`)   |
| Platform env      | `ERP_PLATFORM_API_KEY` — must equal the ERP's `Platform:ApiKey`       |
| Platform env      | `APP_URL` — used to build the request URL                             |

The platform calls the ERP through `erp.listSubscriptionsM2M(apiKey)` (`lib/erp.ts`), which
sends `X-Platform-ApiKey: <ERP_PLATFORM_API_KEY>` and no user token. The ERP validates it with
a constant-time comparison and returns 401 on mismatch.

**Step 1 — call the ERP M2M route directly** (the platform's source of truth):

```bash
# Reads the secret from the environment. Never inline a real key.
curl -sS \
  -H "X-Platform-ApiKey: ${ERP_PLATFORM_API_KEY:?set ERP_PLATFORM_API_KEY}" \
  "${ERP_API_URL:?set ERP_API_URL}/platform/billing/subscriptions" \
  | jq .
```

**Step 2 — call the platform endpoint as a signed-in platform admin:**

```bash
# Reuse the platform-admin browser session cookie.
curl -sS \
  -H "Cookie: ${PLATFORM_SESSION_COOKIE:?set PLATFORM_SESSION_COOKIE}" \
  "${APP_URL:?set APP_URL}/api/admin/revenue" \
  | jq .data
```

**Step 3 — compare**

| Field                                                                             | Expectation                                                                                         |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `source`                                                                          | `erp-aggregate` (the aggregate M2M route is the shipped source)                                     |
| `ok`                                                                              | `true`                                                                                              |
| `counts.active` / `counts.trial` / `counts.expired`                               | Match the ERP payload; `counts.total` equals the number of subscription rows                        |
| `mrr`                                                                             | Sum of `priceMonthly` across **active, non-trial** tenants (trial and expired tenants contribute 0) |
| `subscriptions[].tenantId`, `tenantName`, `subdomain`, `planName`, `priceMonthly` | Match the ERP rows one-for-one                                                                      |
| `subscriptions[].endDate` / `trialExpirations[].endDate`                          | Match the ERP's **ISO** `endDate` value                                                             |
| `trialExpirations`                                                                | Contains only trial tenants with an end date, sorted ascending by `endDate`                         |

Compare against the ISO `endDate` field, not the localized `endDateFormatted` display string —
the latter is a presentation-layer rendering and is not a data-integrity signal.

**Step 4 — verify the degraded path.** Two cases, both must return HTTP **200** with
`ok: false` and an Arabic `error` message, so the admin UI shows a warning banner instead of
crashing:

1. Remove `ERP_PLATFORM_API_KEY` and reload → `createDegradedRevenuePayload('مفتاح الربط مع نظام الـ ERP غير مهيأ')`.
2. Point `ERP_API_URL` at an unreachable host (or stop the ERP) → the fetched call throws and
   the route catches it, returning `'تعذر الاتصال بخادم فوترة الـ ERP حالياً — جاري عرض حالة الأمان'`.

In both cases `counts`, `mrr`, `subscriptions`, and `trialExpirations` come back zeroed/empty
while the status code stays 200.

**Access control check (same ticket's security acceptance):** call `/api/admin/revenue` with
no session (expect 401 JSON) and as a non-admin member (expect 403 JSON). `requirePlatformAdmin`
is the first statement in the handler and is backed by a `middleware.ts` route gate.

## 5. Owner-input blockers — do not silently resolve

| Item                                                                | State                    | Why it needs the owner                                                                                                                                                                                                              |
| ------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WhatsApp/support number for `NEXT_PUBLIC_SUPPORT_URL` (`86cbbpyey`) | **owner input required** | The ticket states the owner must record the approved number **on the ticket before wiring**, and forbids committing a placeholder. No number is recorded on the ticket.                                                             |
| X/Twitter handle for `twitter:site` on OG cards (`86cbbpyn5`)       | **owner input required** | The ticket asks for `twitter:card`/`twitter:site`, but the handle was never supplied, so `twitter:site` is currently omitted. The wiring is in place, so supplying the handle needs no code change — see the note below this table. |

`twitter:site` wiring (verified): `components/shared/SEO.tsx` normalises `NEXT_PUBLIC_TWITTER_HANDLE` through `normaliseTwitterHandle` and emits
`<meta name="twitter:site">` only when the result is non-empty (`SEO.tsx:111`); the tag is omitted while the variable is unset, rather
than emitting a guessed handle that would advertise an account the product may not control.

Both are now driven by environment configuration with **no fabricated default**:
`lib/env.ts` resolves `supportUrl` from `NEXT_PUBLIC_SUPPORT_URL` falling back to an empty
string, `.env.example` ships the key empty with a comment pointing at ticket `86cbbpyey`, and
the Dockerfile build arg no longer bakes in a value. When the variable is empty, the contact
CTAs are omitted rather than pointing at a wrong destination.

`NEXT_PUBLIC_*` values are inlined at build time, so supplying the number requires a rebuild
of the client bundle — updating a runtime `.env` alone will not reach the browser.

**Contact surfaces — behaviour when the URL is unset.** The fix was applied to every
support entry point. Two of them were wrong, for different reasons, and are recorded here
rather than dropped:

- `components/shared/shell/Header.tsx` — **fixed in this branch.** It previously rendered
  `<a href={env.supportUrl}>` unconditionally in both the desktop icon (then line 58) and the
  mobile dropdown entry (then line 113), so once the variable lost its fabricated default an
  unset `NEXT_PUBLIC_SUPPORT_URL` produced a dead `href=""` self-link — the exact failure
  the conditional rendering elsewhere exists to prevent. Both sites are now guarded with
  `{env.supportUrl && (…)}`: `Header.tsx:60` (desktop, `href` at `:62`) and
  `Header.tsx:112` (mobile, `href` at `:121`).
- `components/billing/Help.tsx` — **fixed in this branch.** The `Contact Support` button on
  every team billing page (mounted at `pages/teams/[slug]/billing.tsx:53`) rendered
  `href={process.env.NEXT_PUBLIC_SUPPORT_URL || ''}` together with `target="_blank"`, so
  with the variable unset the button was a self-link that reopened the current page in a new
  tab. This pattern is **pre-existing on `main` and untouched by PR #56**:
  `git show origin/main:components/billing/Help.tsx` and
  `git show origin/fix-platform-frontend-issues:components/billing/Help.tsx` both show the
  same expression at line 19 — but the PR's Dockerfile build arg had been masking it by
  baking in a hardcoded number, so removing that number made the defect user-visible again.
  The component now returns `null` when no URL is configured (`Help.tsx:17`), omitting the
  whole card rather than leaving copy that promises a support channel which does not exist.
  This also corrects the claim previously recorded in `docs/env-matrix.md` §3.7 that the
  empty fallback "renders no support link".

The other surfaces already implement the conditional pattern correctly and can be used as the
reference: `FenoiseHeader.tsx` (omits the nav entry), `TrustStrip.tsx` (renders the pill only
when set), `FooterSection.tsx` (builds `supportLinks` from `env.supportUrl`), and
`MobileSection.tsx`, which now reads `NEXT_PUBLIC_APP_STORE_URL` / `NEXT_PUBLIC_PLAY_STORE_URL`
and renders the store badges as non-interactive "coming soon" affordances when those are
unset — so the app-store badges no longer point at a WhatsApp chat.

The original hardcoded number was an Egyptian (+20) line, while the funnel targets Saudi
Arabia (the landing JSON-LD declares `areaServed: SA` and the trust strip advertises
mada/Tabby/Tamara). Nothing in the branch should reintroduce a region-specific default.

Three further build-time keys were introduced by this work and are **read directly from
`process.env`** rather than through the `lib/env.ts` module: `NEXT_PUBLIC_APP_STORE_URL` and
`NEXT_PUBLIC_PLAY_STORE_URL` in `MobileSection.tsx`, and `NEXT_PUBLIC_TWITTER_HANDLE` in
`components/shared/SEO.tsx`. All three are documented in `.env.example`, each with a comment
recording the empty-by-default behaviour, and all three remain absent from `lib/env.ts` —
fold them into the env module when the corresponding features are switched on.

## 6. Files changed

The review-fix branch is a follow-up commit on top of PR #56. Treat this section as
approximate: the branch carries concurrent edits from several workstreams, and the PR itself
spans 44 files (+2234 / −184) against `origin/main`, grouped as:

- `public/` — `robots.txt`, `sitemap.xml`, `og-image.png`
- `pages/` — `index.tsx`, `pricing.tsx`, `register.tsx`, `terms.tsx`, `privacy.tsx`, `admin.tsx`,
  `admin/revenue.tsx`, `api/admin/revenue.ts`, `api/password.ts`, `payment/{success,failed}.tsx`,
  `teams/[slug]/{erp,products}.tsx`, `_document.tsx`
- `components/` — `admin/{AdminNav,AdminRevenueTable}.tsx`, `defaultLanding/fenoise/*`,
  `shared/{SEO,ConfirmationDialog,index}.tsx`, `shared/shell/{Header,TeamNavigation}.tsx`,
  `layouts/PublicLayout.tsx`
- `lib/` — `adminRevenue.ts`, `env.ts`, `erp.ts`; plus `hooks/useAdminRevenue.ts`
- `middleware.ts`, `Dockerfile`, `.env.example`, `locales/{ar,en}/*.json`, `__tests__/`, `tests/`, `docs/`

The review-fix branch additionally touches `middleware.ts` (public-asset allowlist), the
support-URL wiring, the admin i18n plumbing, and the revenue date formatting and tests.
