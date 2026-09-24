-- 04-billing.sql — local billing rows: service/price catalogue + two subscriptions.
--
-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ READ THIS BEFORE EXPECTING THE PRICING PAGE TO CHANGE.                      │
-- │                                                                             │
-- │ `pages/pricing.tsx` does NOT read these tables. Its `getServerSideProps`     │
-- │ calls `erp.getPackages()`, i.e. the ERP catalogue over                │
-- │ `GET /platform/TenantRegistration/catalog/packages`. What the public pricing │
-- │ page sells is the ERP's Packages — see `erp-paid-packages.sql`.              │
-- │                                                                             │
-- │ Service/Price below feed `models/dashboard.ts`, which counts them for the   │
-- │ team dashboard TILES only. They do NOT reach `/admin/revenue`: that route   │
-- │ reads ONLY the ERP M2M aggregate (`pages/api/admin/revenue.ts` →            │
-- │ `erp.listSubscriptionsM2M`) and makes ZERO prisma calls (verified). In      │
-- │ production these rows are written by `npm run sync-stripe`                  │
-- │ (`scripts/sync-stripe.js`) from the live Stripe API — they are a MIRROR of  │
-- │ Stripe, which is why they are fabricated here rather than left empty.       │
-- └─────────────────────────────────────────────────────────────────────────────┘
--
-- Ids use the `service_demo_` / `price_demo_` / `sub_demo_` text prefixes, which is
-- what 00-teardown.sql matches on. `Subscription.id` is a text PK (it is a Stripe
-- subscription id in production); `Subscription.endDate` is NOT NULL — a cancelled
-- subscription still needs an end date, and `cancelAt` is what marks the request.
--
-- `Price.metadata` is a NOT NULL jsonb column: an INSERT that omits it fails.

\set ON_ERROR_STOP on

INSERT INTO "Service" (id, name, description, features, image, created, "createdAt", "updatedAt") VALUES
  ('service_demo_001', 'Demo Starter',
   'Local demo plan — the small-business tier, mirroring what sync-stripe writes from Stripe.',
   ARRAY['حتى 5 مستخدمين', 'Up to 5 users', 'Invoicing', 'Inventory', 'Email support']::text[],
   'https://placehold.co/512x512/png', now() - interval '90 days', now() - interval '90 days', now() - interval '90 days'),
  ('service_demo_002', 'Demo Growth',
   'Local demo plan — the mid tier, with accounting and multi-branch support.',
   ARRAY['حتى 25 مستخدمًا', 'Up to 25 users', 'Accounting', 'Multi-branch', 'Priority support']::text[],
   'https://placehold.co/512x512/png', now() - interval '90 days', now() - interval '90 days', now() - interval '90 days')
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  features    = EXCLUDED.features,
  image       = EXCLUDED.image,
  "updatedAt" = EXCLUDED."updatedAt";

-- `amount` is in the currency's MAJOR unit — the convention the app's own writer
-- uses, NOT Stripe's minor unit. `scripts/sync-stripe.js:93` stores
-- `data.unit_amount / 100` (dividing Stripe's minor unit down), and the only
-- consumer renders it raw: `components/billing/PaymentButton.tsx:22-27` prints
-- `${symbol}${price.amount}`. So these must be whole riyals. Earlier revisions
-- stored 9900/99000/24900 and displayed as "SAR9900 / month" — a 100x error.
INSERT INTO "Price" (id, "billingScheme", currency, "serviceId", amount, metadata, type, created) VALUES
  ('price_demo_001', 'per_unit', 'sar', 'service_demo_001', 99,
   '{"demo": true, "interval": "month", "tier": "starter"}'::jsonb, 'recurring', now() - interval '90 days'),
  ('price_demo_002', 'per_unit', 'sar', 'service_demo_001', 990,
   '{"demo": true, "interval": "year", "tier": "starter"}'::jsonb, 'recurring', now() - interval '90 days'),
  ('price_demo_003', 'per_unit', 'sar', 'service_demo_002', 249,
   '{"demo": true, "interval": "month", "tier": "growth"}'::jsonb, 'recurring', now() - interval '90 days')
ON CONFLICT (id) DO UPDATE SET
  "billingScheme" = EXCLUDED."billingScheme",
  currency        = EXCLUDED.currency,
  "serviceId"     = EXCLUDED."serviceId",
  amount          = EXCLUDED.amount,
  metadata        = EXCLUDED.metadata,
  type            = EXCLUDED.type;

-- The two customer ids below are the SAME strings stored on "Team"."billingId"
-- (02-teams-memberships.sql), which is what ties a demo workspace to its billing
-- state: demo-alpha → cus_demo_active (healthy), demo-beta → cus_demo_cancelled.
INSERT INTO "Subscription" (
  id, "customerId", "priceId", active, "startDate", "endDate", "cancelAt", "createdAt", "updatedAt"
) VALUES
  ('sub_demo_001', 'cus_demo_active', 'price_demo_001', true,
   now() - interval '30 days', now() + interval '335 days', NULL,
   now() - interval '30 days', now() - interval '30 days'),

  -- Cancelled: inactive, end date in the PAST, cancelAt set. Drives the
  -- "subscription ended" branch rather than an empty table.
  ('sub_demo_002', 'cus_demo_cancelled', 'price_demo_003', false,
   now() - interval '60 days', now() - interval '30 days', now() - interval '35 days',
   now() - interval '60 days', now() - interval '35 days')
ON CONFLICT (id) DO UPDATE SET
  "customerId" = EXCLUDED."customerId",
  "priceId"    = EXCLUDED."priceId",
  active       = EXCLUDED.active,
  "startDate"  = EXCLUDED."startDate",
  "endDate"    = EXCLUDED."endDate",
  "cancelAt"   = EXCLUDED."cancelAt",
  "updatedAt"  = EXCLUDED."updatedAt";

\echo '==> 04-billing.sql: 2 services + 3 prices + 2 subscriptions ensured'
