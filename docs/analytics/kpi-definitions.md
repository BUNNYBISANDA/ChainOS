# KPI Definitions

Every number the Control Tower and its drill-down pages show, with its exact source. "Filters respected" means the KPI narrows to the request's resolved date range and, where noted, warehouse. See `docs/architecture/analytics.md` for the module that computes these and `docs/adr/0010-otif-definition.md` / `docs/adr/0011-inventory-risk-model.md` for the two most involved formulas.

## Procurement

**Open Purchase Orders** — count of `PurchaseOrder` where `status IN (DRAFT, APPROVED, SHIPPED, PARTIALLY_RECEIVED)`. Date field: `orderDate`. Filters: date range, warehouse.

**Open PO Value** — `Σ (qtyOrdered × unitCost)` over `PurchaseOrderLine`s belonging to an open PO (same status set as above). Excludes received/cancelled POs entirely, including the already-received portion of a partially-received PO's own lines (the whole line's ordered value counts, not just the outstanding quantity — this is "value on order," not "value still owed").

**Overdue Purchase Orders** — open PO (same status set) where `expectedDeliveryDate < now`. A PO with no `expectedDeliveryDate` can never be overdue.

**Partially Received Purchase Orders** — count where `status = PARTIALLY_RECEIVED`.

## Inventory

**Inventory Value** — `Σ (quantityOnHand × Product.costPrice)` over `StockLevel`, documented explicitly as a **current/standard cost approximation** — not FIFO, LIFO, or weighted-average, since ChainOS has no costing-method field. Filters: warehouse.

**Products Missing Cost Price** — count of distinct products in scope with `costPrice = 0`. `costPrice` is a non-nullable column defaulting to `0`, so an exact `0` is treated as "unset" for this data-quality check — it is *not* silently valued as a real zero-cost product in Inventory Value's total without being surfaced.

**SKUs With Zero Available Stock** — count of (product, warehouse) rows where `Available <= 0` (see Inventory Risk below).

**SKUs At Inventory Risk** — count of (product, warehouse) rows where risk level is `STOCKOUT` or `PROJECTED_STOCKOUT` (never `HEALTHY`). Full formula: `docs/adr/0011-inventory-risk-model.md`.

## Fulfillment

**Open Sales Orders** — count where `status IN (DRAFT, CONFIRMED, ALLOCATED, PARTIALLY_FULFILLED)`. Date field: `orderDate`.

**Awaiting Allocation** — count where `status = CONFIRMED`.

**Partially Fulfilled** — count where `status = PARTIALLY_FULFILLED`.

**Fulfilled** — count where `status = FULFILLED`, `orderDate` in range.

**Customer OTIF** — full definition: `docs/adr/0010-otif-definition.md`. Summary: `successful eligible orders / eligible orders × 100`, eligible = linked outbound `Shipment` reached `DELIVERED` with a `requestedDeliveryDate` on file, filtered by `deliveredAt` (not `orderDate`) falling in the selected range. `null` (render `"N/A"`) on zero eligible orders — never `0%`.

**Orders Missing Requested Date** — count of otherwise-eligible delivered orders (linked shipment `DELIVERED`) with no `requestedDeliveryDate` — excluded from the OTIF denominator, surfaced as a data-quality issue instead.

## Logistics

**Active Shipments / Inbound Active / Outbound Active** — count where `status IN (CREATED, BOOKED, IN_TRANSIT, ARRIVED)`, the exact set `ShipmentsService.ACTIVE_STATUSES` already uses — analytics does not redefine "active," it aggregates the existing definition. Warehouse filter matches origin (outbound) or destination (inbound) warehouse.

**Delayed Shipments** — active shipments with an open `ShipmentException` of type `ETA_EXCEEDED` (Phase 3's own exception detection, reused as-is).

**Needs Attention** — active shipments with any open exception.

**Avg Transit Time** — mean of `(actualArrivalAt − actualDepartureAt)` in hours, over `DELIVERED` shipments with both timestamps set, `deliveredAt` in range. Never mixes in-flight shipments into the average.

**Logistics On-Time %** — of `DELIVERED` shipments with an `estimatedArrivalAt` set, the percentage where `deliveredAt <= estimatedArrivalAt`. This is a shipment-level ETA-adherence metric, distinct from Customer OTIF (which also checks full-quantity fulfillment against the *customer's requested* date, not the carrier's ETA).

## Supplier performance (per supplier)

**Spend** — `Σ (qtyOrdered × unitCost)` over that supplier's `PurchaseOrderLine`s in range (all POs, any status — this is total committed spend, not just open).

**PO Count / Open PO Count** — total POs in range; POs currently in an open status.

**Avg Lead Time** — mean of `(last GoodsReceipt.receivedAt − PurchaseOrder.approvedAt)` in days, over `RECEIVED` POs with both timestamps.

**On-Time % / Supplier OTIF %** — see `docs/adr/0010-otif-definition.md`. In-full is implied by `RECEIVED`, so these two numbers are currently identical for every supplier; they're kept as separate fields because a future in-full definition (e.g. once partial-quantity-per-receipt data exists) could make them diverge without an API shape change.

**Late POs** — count of eligible `RECEIVED` POs where the last receipt landed after `expectedDeliveryDate`.

## Exception severities

- **CRITICAL** — inventory `STOCKOUT` with open demand (`demand > 0`); every Logistics-domain exception keeps the severity Phase 3 already assigned it (e.g. `ETA_EXCEEDED` past 24 hours).
- **WARNING** — inventory `PROJECTED_STOCKOUT`; overdue PO; overdue requested sales-order delivery; Logistics exceptions Phase 3 marked `WARNING`.
- **INFO** — reserved for future use; nothing currently computed at this phase emits `INFO`.

No severity is assigned without one of the rules above — see `docs/adr/0011-inventory-risk-model.md` and the `ExceptionsService` source for the exact conditions.

## Rendering rules

- A metric with a possible zero denominator (OTIF, on-time %) renders `null` from the API and `"N/A"` in the UI — never `"0%"`, `NaN`, or `Infinity`.
- All money values use `Intl.NumberFormat` with the tenant's currency (`THB` today) via `lib/format.ts`'s `formatMoney` — never a hard-coded `฿` string.
- All dates are computed and compared in UTC.
