# ADR 0010: OTIF (On-Time-In-Full) Definition

## Status

Accepted

## Context

ChainOS has two OTIF-shaped questions: did we deliver to a customer on time and in full (customer OTIF), and did a supplier deliver to us on time and in full (supplier OTIF). Both need one unambiguous "delivered" timestamp and one unambiguous "in full" condition, chosen from data ChainOS actually has — not guessed.

For the outbound side, `SalesOrder.status = FULFILLED` is tempting to read as "delivered," but it isn't: `SalesOrdersService.fulfill()` (ADR 0007) marks a line fulfilled when the warehouse has picked/packed/shipped it internally, fully decoupled from `Shipment` tracking. A `SalesOrder` can reach `FULFILLED` with no `Shipment` ever created, and a `Shipment` can reach `DELIVERED` independently of when (or whether) the linked `SalesOrder`'s lines finish fulfilling. Only the `Shipment` reaching `DELIVERED` represents the customer actually receiving something.

## Decision

**Customer OTIF.** Eligible: a `SalesOrder` with a linked outbound `Shipment` at `status = DELIVERED`, and a `requestedDeliveryDate` on file. Orders with no delivered shipment yet are still in flight, not failures — they're excluded from the denominator, not scored. Orders with a delivered shipment but no `requestedDeliveryDate` are also excluded (there's no target to judge "on time" against) and are counted separately as a data-quality issue (`ordersMissingRequestedDate`), never silently treated as a pass or fail.

Success: `SalesOrder.status = FULFILLED` (in full, by construction of that status — see ADR 0007) **and** `Shipment.deliveredAt <= requestedDeliveryDate`. `deliveredAt` (not `actualArrivalAt`) is the field used — `actualArrivalAt` is set on the `ARRIVED` transition and never overwritten on `DELIVERED`, so it can predate the actual delivery moment when a shipment sits `ARRIVED` before being marked `DELIVERED`. `deliveredAt` is set exactly once, on the `DELIVERED` transition (`ShipmentsService.transition()`), and is the only field that means "this is when it was delivered."

Formula: `OTIF % = successful eligible orders / eligible orders × 100`, `null` (rendered "N/A") when there are zero eligible orders.

**Supplier OTIF (inbound).** Eligible: a `PurchaseOrder` at `status = RECEIVED` with `expectedDeliveryDate` on file and at least one `GoodsReceipt`. In-full is implied by `RECEIVED` (mirrors the outbound side — `PurchaseOrdersService.receive()` only sets `RECEIVED` when every line is fully received). On time: the most recent `GoodsReceipt.receivedAt` for that PO is on or before `expectedDeliveryDate`.

## Consequences

OTIF for both directions is computed from fields already written by the existing lifecycle services — no new columns beyond `Shipment.deliveredAt`, added specifically because nothing else on the existing schema unambiguously meant "delivered." The golden fixture in `apps/api/test/integration/analytics.integration-spec.ts` and the seed data in `packages/database/prisma/seed.ts` ("Phase 4 analytics demo") both encode the three-order scenario from spec §50 (on-time-in-full pass, on-time-but-incomplete fail, in-full-but-late fail) and assert the exact 33.33% result, so a future change to this logic that breaks the definition fails a test immediately rather than silently drifting.
