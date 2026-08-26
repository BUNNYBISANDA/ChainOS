# Supply Chain Control Tower

`/control-tower` is the operational command center added in Phase 4 — a backend-aggregated view distinct from the lightweight `/dashboard` (kept as-is; it stays a fast landing page, not a duplicate of this).

## Layout

Top to bottom (`apps/web/app/(app)/control-tower/page.tsx`):

1. **Header** — title, resolved period, "last updated" timestamp.
2. **Filter bar** — date-range preset (Today/7d/30d/90d) or custom From/To, plus warehouse. A plain `<form method="GET">`, matching every other list page's filter convention (`purchase-orders`, `shipments`) — filters live entirely in the URL (`?range=30d&warehouseId=...`), so refresh, back/forward, and shared links all just work.
3. **Primary KPI row** — Open POs, Open SOs, Active Shipments, Customer OTIF. Each card links to the existing operational list page pre-filtered to the records behind the number (drill-down, spec §22).
4. **Supply Chain Network Map** — suppliers, warehouses, customers, and active shipments with real coordinates on file. See "Network map" below.
5. **Risk / Exception layer** — Inventory Risk summary (value, at-risk count, zero-available count, missing-cost count) and the top 5 open Operational Exceptions, each linking to `/inventory/risk` and `/exceptions` respectively.
6. **Performance** — Procurement Performance (overdue, partially received, open value) and Fulfillment Performance (awaiting allocation, partially fulfilled, fulfilled) cards, plus a Logistics row (inbound/outbound active, delayed, on-time %).
7. **Trends** — three ECharts: Customer OTIF trend (line), Inventory flow inbound-vs-outbound (grouped bar, physical ledger only), PO value trend (bar). Each has a title, resolved period implied by the shared filter bar, a tooltip, and an empty state when there's no data in range.
8. **Supplier Performance** — top 5 by spend, linking to `/analytics/suppliers` for the full paginated/sortable table.
9. **Data Quality** — only rendered when there's at least one issue; a plain count with a short breakdown, never an invented score (spec §45).

## Drill-down map

| Control Tower element | Target |
|---|---|
| Open Purchase Orders | `/purchase-orders` |
| Overdue POs | `/purchase-orders?overdue=true` |
| Partially Received | `/purchase-orders?status=PARTIALLY_RECEIVED` |
| Open Sales Orders | `/sales-orders` |
| Awaiting Allocation / Partially Fulfilled / Fulfilled | `/sales-orders?status=...` |
| Active / Inbound / Outbound / Delayed Shipments | `/shipments` (+ `direction=`/`delayed=true`) |
| Inventory Risk | `/inventory/risk` (+ `warehouseId=`/`risk=`) |
| Exceptions | `/exceptions` (+ `domain=`/`severity=`) |
| Supplier Performance row | `/suppliers/:id` (existing Supplier detail page, now with a Performance card) |
| Exception entity link | The shipment/PO/SO/product page the exception is actually about |

Every drill-down reuses an existing operational page rather than duplicating a list inside the analytics module (spec §40) — the only genuinely new list pages are `/inventory/risk`, `/analytics/suppliers`, and `/exceptions`, none of which existed before and none of which has an existing equivalent to reuse.

## Network map

Client component (`app/(app)/control-tower/network-map.tsx`), MapLibre GL — the same library and marker/popup pattern the Phase 3 shipment map already established. Blue markers are suppliers, purple are warehouses, green are customers, orange are active shipments (current location, or origin/destination if no current tracking fix exists). Only entities with real coordinates render; nothing is geocoded or invented. No route lines are drawn between points — ChainOS has no real routing data, and a straight line would read as a fabricated route rather than what it actually is (a relationship between two nodes). Clicking a warehouse marker re-filters the whole Control Tower to that warehouse.

## Known limitations

- Warehouse markers show identity only (name, coordinates) in their popup — full per-warehouse metrics (inventory value, active inbound/outbound, open exceptions) inline in the popup would require a per-warehouse breakdown endpoint not built this phase; clicking the marker filters the whole page to that warehouse instead, which surfaces the same information one click away.
- Average order cycle time (confirmed → fulfilled) is not implemented — `SalesOrder` has no `fulfilledAt` timestamp today, and deriving one from `StockMovement` history for a KPI-only purpose was judged not worth the additional query complexity at this phase. Candidate for Phase 5 if a fulfillment-cycle KPI becomes a priority.
