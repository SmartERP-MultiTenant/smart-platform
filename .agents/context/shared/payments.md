<!-- Context: shared/payments | Priority: high | Version: 1.0 | Updated: 2026-08-24 -->

# Payments across the product

Purpose: a map of how payments work across the three repos (WebAPI providers + standalone integrations + SPA-side payment UI). Not an implementation doc — see the code and `SmartAndPro.ERP.Inventory/docs/payment-system.md` for details.

## Key points

- **Method → provider (WebAPI `PaymentService`)** — current mapping: `card`/`mada`/`apple_pay` → **MoyasarProvider** (`PaymentService.cs`), `tabby` → **TabbyProvider** (mock), `tamara` → **TamaraProvider** (mock), `stc_pay` → **HyperPayProvider** (mock). **PaymobProvider** remains an available real provider (3-step token→order→payment-key) but is NOT the current selection for those methods. Map persisted in the `Payments` table; endpoint `POST /api/payments`, methods `GET /api/payments/methods?country=SA`.
- **Paymob (real)** — SPA drives the flow: `services/paymob` (`environment.paymob`: currency `EGP`, `integrationId` 5410149, `accept.paymob.com`) with `payment-callback.component` for the SPA-side return; WebAPI `PaymobProvider` handles the server side (`PaymobService` in Application layer).
- **Moyasar (current card/mada/apple_pay provider)** — `Providers/MoyasarProvider.cs`, registered in `Program.cs`/`PaymentService`, configured under `PaymentProviders:Moyasar` (a live-looking `sk_test_...` key is committed). Not yet covered by `docs/payment-system.md` — treat the map above as current truth.
- **Standalone commerce/health integrations (not `PaymentService`)** — Salla and Zid (OAuth e-commerce, webhooks redirect to `erp.smartapro.com`), Wasafaty + CCHI (both NPHIES FHIR R4), ChannelManager (background sync service). Config under Salla/Zid/Wasafaty/CCHI/ChannelManager in `appsettings.json`.
- **Product-level decision** — smart-platform context decision: _swap Stripe for Moyasar/Tabby/Tamara_. The ERP already wires Moyasar plus Tabby/Tamara mocks; productionize by flipping mock→real providers and auditing committed keys (secrets-hygiene risk).
