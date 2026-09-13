# Platform ↔ ERP M2M API Contract (P5.6 Rules & Modules)

## 1. Overview & Architecture
This contract establishes the Machine-to-Machine (M2M) communication protocol between the SaaS Platform (`smart-platform`) and the ERP Backend (`SmartAndPro.ERP.WebAPI`).
All endpoints defined here are protected by the header `X-Platform-ApiKey` and do NOT require human user login or bearer sessions.

## 2. Authentication
* **Header**: `X-Platform-ApiKey: <ERP_PLATFORM_API_KEY>`
* **ERP Validation**: Constant-time key comparison against configuration key `Platform:ApiKey`. Mismatch results in HTTP `401 Unauthorized`.

---

## 3. Endpoints

### 3.1 Get All System Modules
* **Method**: `GET /api/platform/billing/system-modules`
* **Response (200 OK)**:
```json
[
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "code": "ACCOUNTING",
    "name": "المحاسبة العامة",
    "description": "إدارة شجرة الحسابات والقيود اليومية والتقارير الختامية",
    "priceMonthly": 50.0,
    "priceYearly": 500.0,
    "isActive": true
  }
]
```

### 3.2 Get All Packages (Plans)
* **Method**: `GET /api/platform/billing/packages`
* **Response (200 OK)**:
```json
[
  {
    "id": "4fa85f64-5717-4562-b3fc-2c963f66afa7",
    "name": "الأساسية (Basic)",
    "description": "باقة مناسبة للمنشآت الصغيرة",
    "priceMonthly": 100.0,
    "priceYearly": 1000.0,
    "trialDays": 14,
    "isActive": true,
    "createdAt": "2026-09-01T00:00:00Z",
    "systemModules": [
      {
        "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "code": "ACCOUNTING",
        "name": "المحاسبة العامة"
      }
    ],
    "systemModuleCodes": ["ACCOUNTING"]
  }
]
```

### 3.3 Get Package by ID
* **Method**: `GET /api/platform/billing/packages/{id}`
* **Response (200 OK)**: Single package object (same shape as above).
* **Response (404 Not Found)**: `{ "error": "Package not found." }`

### 3.4 Update Package Modules (Per-Plan Module Toggles)
* **Method**: `PUT /api/platform/billing/packages/{id}/modules`
* **Request Body**:
```json
{
  "systemModuleIds": [
    "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "7fa85f64-5717-4562-b3fc-2c963f66afa8"
  ],
  "syncExistingSubscriptions": true
}
```
* **Response (200 OK)**: Updated package object.
* **Propagation Semantics**:
  * When `syncExistingSubscriptions` is `true`, all active and trial subscriptions (`Status == Active || Status == Trial`) associated with this package have their `SubscriptionModules` updated: revoked modules are removed, and newly enabled modules are added.

### 3.5 Sync Subscription Modules
* **Method**: `POST /api/platform/billing/subscriptions/sync-modules`
* **Request Body**:
```json
{
  "packageId": "4fa85f64-5717-4562-b3fc-2c963f66afa7" // optional, null/empty syncs all packages
}
```
* **Response (200 OK)**:
```json
{
  "message": "Synchronized modules for 12 active subscriptions across 1 packages."
}
```

---

## 4. Single Source of Truth
* The ERP database (`Packages`, `SystemModules`, `PackageModules`, `SubscriptionModules`) is the canonical billing and rules source of truth.
* The Platform admin UI manages these rules exclusively through the M2M endpoints defined above.
