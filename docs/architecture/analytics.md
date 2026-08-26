# Analytics & Control Tower Architecture

ChainOS Phase 4 adds a read-only cross-domain analytics layer on top of Procurement, Inventory, Fulfillment, and Logistics, plus the Supply Chain Control Tower UI that consumes it. See `docs/adr/0009-analytics-read-model.md` for the read-model decision, `docs/adr/0010-otif-definition.md` and `docs/adr/0011-inventory-risk-model.md` for the two most consequential formulas, and `docs/analytics/kpi-definitions.md` for every KPI's exact numerator/denominator.

## Module layout

`apps/api/src/modules/analytics/`

- `analytics.module.ts` — wires everything below into `AppModule`.
- `analytics.controller.ts` — every `/analytics/*` route (list below), each gated by its own `@RequirePermissions(...)`.
- `analytics-filters.ts` — `parseAnalyticsFilters()` resolves the shared `range`/`from`/`to`/`warehouseId`/`supplierId`/`customerId`/`direction` query params into one typed `AnalyticsFilters` object every service consumes identically; `parsePage()` resolves `page`/`pageSize` (default 25, max 100).
- `analytics.util.ts` — pure, dependency-free helpers: `resolveDateRange`, `safePercent` (null on zero denominator), `classifyInventoryRisk`, `isOtifSuccess`, trend bucketing. Unit-tested directly in `analytics.util.spec.ts` — no mocking needed since these take plain values, not a transaction.
- `procurement-analytics.service.ts`, `inventory-analytics.service.ts`, `fulfillment-analytics.service.ts`, `logistics-analytics.service.ts`, `supplier-analytics.service.ts`, `exceptions.service.ts` — one per domain, each a normal Nest service using `withTenant()` the same way every other module does.
- `control-tower.service.ts` — calls the domain services above in parallel (`Promise.all`) and assembles the compact `/analytics/control-tower` payload (spec §33): aggregates plus a small `top` exceptions/suppliers list, never a full detail list. Also computes the network-map point data (see below).

Every service function that does the actual query work takes `(tx, tenantId, filters)` and is exported or reused directly where another service needs the same computation — e.g. `computeInventoryRiskRows()` in `inventory-analytics.service.ts` is called by both `InventoryAnalyticsService` and `ExceptionsService`, so risk classification exists in exactly one place.

## Endpoints

| Method & path | Permission | Notes |
|---|---|---|
| `GET /analytics/control-tower` | `analytics:control-tower:read` | Full summary (spec §33 shape) |
| `GET /analytics/procurement` | `analytics:procurement:read` | Open/overdue/partial counts + open value |
| `GET /analytics/procurement/po-value-trend` | `analytics:procurement:read` | Bucketed PO value over time |
| `GET /analytics/inventory` | `analytics:inventory:read` | Inventory value + data-quality counts |
| `GET /analytics/inventory/risk` | `analytics:inventory:read` | Paginated, sortable by most-negative projected; filters: `warehouseId`, `risk`, `productId` |
| `GET /analytics/inventory/movement-trend` | `analytics:inventory:read` | Physical inbound/outbound ledger only, never reservations |
| `GET /analytics/fulfillment` | `analytics:fulfillment:read` | Open/awaiting/partial/fulfilled counts + customer OTIF |
| `GET /analytics/fulfillment/otif-trend` | `analytics:fulfillment:read` | Bucketed OTIF over time |
| `GET /analytics/logistics` | `analytics:logistics:read` | Active/delayed counts, avg transit time, on-time % |
| `GET /analytics/suppliers` | `analytics:suppliers:read` | Paginated performance table; `sort`, `search` |
| `GET /analytics/suppliers/:id` | `analytics:suppliers:read` | Single-supplier performance (feeds the Supplier detail page) |
| `GET /analytics/exceptions` | `exceptions:read` | Paginated aggregated exceptions; `domain`, `severity` |

`purchase-orders` and `sales-orders` (existing Procurement/Fulfillment controllers) each gained one additive `overdue=true` filter for KPI drill-down, instead of the analytics module duplicating a purchase/sales-order list.

## Filters

`range` (`today`/`7d`/`30d`/`90d`) or explicit `from`/`to` (the latter always wins when both are present — that's what makes a "custom" range work without a separate code path), plus `warehouseId`. Every sub-service applies the same resolved filter to every query in a given request, so numbers on one payload never mix periods. Dates are resolved in UTC (`setUTCHours`, not `setHours`) — the same "no Buddhist-calendar/timezone surprises" discipline the rest of the app already follows (`lib/format.ts`).

## Permissions

Added to the existing tenant-scoped `Role.permissions: string[]` model (`packages/database/prisma/seed.ts`): `analytics:control-tower:read` and `exceptions:read` are granted to all four seeded roles (Admin/Procurement Manager/Warehouse Manager/Sales Manager) — the Control Tower is everyone's shared operational home page, and ChainOS has no single "sees everything but Admin" role today. Each role additionally gets its own domain permission(s): Procurement Manager → `analytics:procurement:read` + `analytics:suppliers:read`; Warehouse Manager → `analytics:inventory:read` + `analytics:logistics:read`; Sales Manager → `analytics:fulfillment:read`. Admin has everything via the existing `ALL_PERMISSIONS` bundle.

## Network map data

`ControlTowerService.network()` returns only entities with real coordinates on file — `Supplier.latitude/longitude`, `Warehouse.latitude/longitude`, `Customer.latitude/longitude` (all added this phase, nullable, populated only where known) plus active `Shipment`s' `currentLatitude/Longitude` (falling back to origin, then destination, coordinates). No coordinate is ever invented or geocoded. Suppliers/warehouses/customers are shown tenant-wide; active shipments respect the `warehouseId` filter using the same origin-or-destination match `LogisticsAnalyticsService` uses for its own counts.

## Indexes

Added in the `phase4_control_tower_analytics` migration, all `[tenantId, ...]` composites matching the query patterns above:

- `PurchaseOrder`: `[tenantId, status]`, `[tenantId, supplierId]`, `[tenantId, expectedDeliveryDate]`
- `SalesOrder`: `[tenantId, status]`, `[tenantId, customerId]`, `[tenantId, requestedDeliveryDate]`
- `Shipment`: `[tenantId, status]`, `[tenantId, direction]`, `[tenantId, estimatedArrivalAt]`, `[tenantId, deliveredAt]`
- `GoodsReceipt`: `[tenantId, receivedAt]`
- `StockMovement`: `[tenantId, createdAt]`

## Performance

Every summary endpoint parallelizes its independent sub-queries with `Promise.all` rather than awaiting sequentially — `ControlTowerService.summary()` is 8 concurrent reads, not 8 round-trips in series. Value aggregates that Prisma's typed API can't express (`qty × unitCost`) select only the needed scalar columns for an already-indexed, already-filtered row set and reduce in the application layer — see `docs/adr/0009-analytics-read-model.md` for why, and revisit with a materialized view only if that row count stops being small.

## Testing

- `apps/api/src/modules/analytics/analytics.util.spec.ts` — pure-function unit tests (unit Jest project).
- `apps/api/test/integration/analytics.integration-spec.ts` — golden-fixture integration tests against a real Postgres tenant: exact OTIF percentage, exact inventory-risk classification and numbers, exact supplier on-time/OTIF, overdue-PO/open-PO-value reconciled against a direct canonical query, date-range and warehouse filtering, zero-denominator → `null`, and explicit cross-tenant aggregate-isolation assertions (a second tenant's control-tower summary never reflects the first tenant's numbers).
- `packages/database/prisma/seed.ts` — the "Phase 4 analytics demo" block seeds the same golden fixtures into the dev database, with expected values documented inline, so the Control Tower UI shows predictable numbers out of the box.
