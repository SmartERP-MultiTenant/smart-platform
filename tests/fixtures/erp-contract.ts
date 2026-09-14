/**
 * Canonical ERP payload fixtures for the public funnel contract (PG-30, PG-20).
 *
 * ## Why this lives outside `__tests__/`
 *
 * Jest's default `testMatch` treats every file under `__tests__/` as a test
 * suite, so a fixture placed there fails with "Your test suite must contain at
 * least one test". `tests/` is excluded from Jest (`testPathIgnorePatterns`) and
 * Playwright only scans `tests/e2e` (`playwright.config.ts:104`), so this path is
 * inert to both runners while still being a first-class tracked artifact.
 *
 * ## What these fixtures are, and are not
 *
 * They are HAND-WRITTEN to the contract the ERP documents, not captured from a
 * live instance — the ERP WebAPI is not reachable from this repo, and
 * `tests/e2e/support/erp-stub.cjs` deliberately serves only the platform-billing
 * surface, not these three routes. So they pin the shapes the two sides agreed
 * on; they cannot prove the ERP still honours them.
 *
 * What that buys is the failure mode PG-30 is actually about. Both sides are
 * consumed through `lib/zod/erp.ts`, so if the ERP's shape drifts, or if someone
 * tightens a schema past what the ERP sends, the assertions in
 * `__tests__/api/public-erp-contract.spec.ts` fail HERE — in a unit test, on the
 * PR — instead of in production, where the symptom is a customer who cannot
 * complete a payment and a 200 response that looks fine in the logs.
 *
 * The tripwire only works if the fixtures stay honest: they must be edited when
 * the ERP changes, never to make a failing assertion pass.
 */

/** `GET /payments/methods?country=SA` — a realistic mixed-availability catalogue. */
export const erpMethodsResponse = [
  {
    key: 'credit_card',
    label: 'بطاقة مدى أو فيزا / ماستركارد',
    provider: 'moyasar',
    available: true,
    iconUrl: 'https://cdn.moyasar.com/icons/card.svg',
  },
  {
    key: 'apple_pay',
    label: 'Apple Pay',
    provider: 'moyasar',
    available: true,
    iconUrl: 'https://cdn.moyasar.com/icons/apple-pay.svg',
  },
  // The ERP reports the method but has switched it off (PG-05). The funnel must
  // never offer it, so no fixture consumer should ever see this entry.
  {
    key: 'stc_pay',
    label: 'STC Pay',
    provider: 'hyperpay',
    available: false,
  },
  // A method with no availability flag at all. Treated as unavailable
  // (fail-closed) — see `erpPaymentMethodSchema`.
  {
    key: 'tabby',
    label: 'Tabby — قسّمها على 4',
    provider: 'tabby',
  },
];

/** `GET /platform/TenantRegistration/catalog/packages`. */
export const erpPackagesResponse = [
  {
    id: '1f1b3311-2477-49f1-8c5c-3abb1c3ecd4c',
    name: 'Starter',
    description: 'للمنشآت الصغيرة',
    priceMonthly: 199,
    priceYearly: 1990,
    trialDays: 14,
    isActive: true,
  },
  {
    id: '2f1b3311-2477-49f1-8c5c-3abb1c3ecd4d',
    name: 'Growth',
    description: 'للشركات النامية',
    priceMonthly: 499,
    trialDays: 14,
    isActive: true,
  },
];

/**
 * `GET /payments/verify/{reference}` — the tri-state contract (P2.14/PG-30).
 *
 * `Pending` is the state the poller keeps polling on, `Paid` is the only state
 * that activates a subscription, `Failed` is a hard failure the poller turns
 * into a redirect to `/payment/failed`. All three are PascalCase because that is
 * what the ERP's `PaymentController` emits.
 */
export const erpVerifyResponse = {
  pending: { success: true, status: 'Pending' },
  paid: { success: true, status: 'Paid' },
  failed: { success: false, status: 'Failed' },
} as const;

/**
 * The pre-rollout body: no `status` field at all.
 *
 * Still contract-legal, and the client depends on it — `settleOptimistically`
 * only fires when `status` is genuinely ABSENT (`pages/payment/success.tsx`).
 * If a future schema change makes this invalid, the poller loses its
 * compatibility path and every pre-rollout ERP starts failing to settle.
 */
export const erpVerifyResponseWithoutStatus = { success: true } as const;

/**
 * 2xx bodies that PARSE but are the wrong shape.
 *
 * This is the P4.10b family, and the reason the fixtures exist as values rather
 * than only as prose: each of these was previously accepted, cast to `T`, and
 * dereferenced — `{}` and `null` made `/pricing` call `.map` on a non-array and
 * 500 in production while `erpFetch` reported success.
 *
 * The last two are the subtler shape: a body that parses to a *list* of things
 * that are not packages. The envelope is legitimate, so the envelope guard
 * cannot catch them; they are handled per entry by `readErpList`.
 */
export const erpWrongShapedBodies = {
  emptyObject: {},
  null: null,
  string: 'not-a-list',
  number: 42,
  nestedUnderData: { data: [] },
  boolean: true,
} as const;

/** A list whose envelope is valid but whose entries are not. */
export const erpListWithInvalidEntries = [
  { id: 'ok', name: 'Valid Plan', priceMonthly: 100 },
  { name: 'Missing id' },
  { id: 'no-name' },
  null,
  'string-entry',
  42,
  { id: 'negative-price', name: 'Bad Price', priceMonthly: -5 },
  { id: '', name: 'Empty id' },
] as const;

/** The entries a correct reader must keep from `erpListWithInvalidEntries`. */
export const erpListWithInvalidEntriesExpected = [
  { id: 'ok', name: 'Valid Plan', priceMonthly: 100 },
];
