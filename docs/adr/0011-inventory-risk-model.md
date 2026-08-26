# ADR 0011: Inventory Risk Model

## Status

Accepted

## Context

The Control Tower needs a deterministic answer to "which SKUs are at risk of running out," using only data ChainOS already tracks — no demand forecasting, no AI, no invented thresholds (spec §14–15).

## Decision

Computed per (product, warehouse) pair, from `StockLevel`, open `PurchaseOrderLine`s, and open `SalesOrderLine`s:

```
Available  = StockLevel.quantityOnHand - StockLevel.quantityReserved
Incoming   = Σ (qtyOrdered - qtyReceived) over PurchaseOrderLines whose PO
             targets this warehouse and is APPROVED / SHIPPED / PARTIALLY_RECEIVED
Demand     = Σ (qtyOrdered - qtyFulfilled) over SalesOrderLines whose SO
             targets this warehouse and is CONFIRMED / ALLOCATED / PARTIALLY_FULFILLED
Projected  = Available + Incoming - Demand
```

`DRAFT` purchase/sales orders are excluded from Incoming/Demand — they're not yet committed (approved, or commercially accepted). `RECEIVED`/`FULFILLED`/`CANCELLED` orders are excluded because they've already been resolved into `StockLevel` (received stock is already on hand; fulfilled demand is already shipped).

Risk level:
- `STOCKOUT` — `Available <= 0`. This holds regardless of `Projected`: zero or negative on-hand-minus-reserved stock is a stockout right now, whatever is inbound.
- `PROJECTED_STOCKOUT` — `Available > 0` but `Projected < 0`.
- `HEALTHY` — `Projected >= 0`.

No `LOW_STOCK` tier: `Product` has no reorder-point field today, and inventing a threshold (e.g. "20% of average demand") would be exactly the kind of unfounded number spec §15 rules out. If a reorder-point field is added to `Product` in a later phase, `LOW_STOCK` (available below reorder point but projection still non-negative) becomes a legitimate fourth tier — not before.

## Consequences

The formula reuses the exact PO/SO status sets other procurement/fulfillment KPIs already use (`INCOMING_PO_STATUSES`, `OPEN_DEMAND_SO_STATUSES` in the respective lifecycle files) — one status-set to keep consistent, not a parallel definition. The golden fixture in `packages/database/prisma/seed.ts` (SKU A: 300/0/800 → -500 → `PROJECTED_STOCKOUT`; SKU B: 1000/500/1200 → 300 → `HEALTHY`) and the corresponding integration test assert the exact numbers, per spec §52.
