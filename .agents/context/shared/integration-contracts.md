<!-- Context: shared/integration-contracts | Priority: high | Version: 1.0 | Updated: 2026-08-24 -->

# Integration contracts

Purpose: the real cross-repo contracts between ClientApp (Angular SPA), Inventory (WebAPI), and the smart-platform admin surface. Verified against the code on 2026-08-24.

## Key points

- **SPA → WebAPI (HTTP)** — authenticated requests (cached JWT in `localStorage.authToken`) carry `Authorization: Bearer <token>` plus an `h-n: <hostname>` tenant hint; unauthenticated calls (login/register — no cached token) go out without either header, so auth endpoints never receive the tenant hint. Central caller `api-caller.service.ts` (30s default timeout), header injection in `http-interceptor.service.ts`. Base per `environment.active_server`: dev `http://localhost:5001/api/`, prod e.g. `https://server-erp.smartapro.com/api/`.
- **SPA → WebAPI (realtime)** — two channels: a SignalR hub `/notificationHub` (mapped in `Program.cs`) and a raw WebSocket endpoint `/ws` (`WebSocketMiddleware`). Two SPA consumers: `SignalRService` (currently hardcoded hub URL `https://localhost:44360/notificationHub`) and a raw `NotificationService` using env `wsUrl` (dev `ws://localhost:5001/ws`).
- **Platform → WebAPI (M2M)** — `X-Platform-ApiKey` header must equal `appsettings Platform:ApiKey`, compared with `CryptographicOperations.FixedTimeEquals` (`WebAPI/Attributes/PlatformApiKeyAttribute.cs`). **Config key is currently empty** ⇒ every `/api/platform/*` call returns **500** until it's set; mismatch returns 401. Platform controllers: `TenantRegistration`, `SuperAdmin`, `PlatformBilling`, `TenantStatus` (+ `SuperAdminService` / `TenantRegistrationService`).
- **Tenancy (`TenantMiddleware`)** — tenant resolved from subdomain (`MultiTenancy:BaseDomain = smartapro.com`, e.g. `company.smartapro.com`) or the JWT `TenantId` claim; `h-n` passes the original host for cross-domain calls. JWT tenant **must** match the subdomain tenant (403 "Token does not belong to this tenant."). True super admin (`IsSuperAdmin=true`, no `TenantId`) bypasses; reserved subdomains `core/admin/api/www/platform`; subdomain-less unauthenticated requests pass (login/register/Swagger).
- **Configuration & ports** — `FrontBaseUrl = https://erp.smartapro.com` (callbacks/payment redirect), `CorsDomains = http://localhost:4200` (ClientApp dev). Ports: ClientApp **4200** · WebAPI **5001** (http) / **7035** (https) · smart-platform dev **4002**. Subdomain-less tenants additionally gate on an active/trial subscription (403 "Subscription expired or inactive."; auth endpoints still allowed).
