# ADR 0008: Shipment Visibility Events and Projections

## Status

Accepted

## Context

Shipments already had a lifecycle status and a minimal event table. Phase 3 needs manual tracking updates, ETA changes, delay detection, current-location display, future carrier ingestion, and tenant-safe exception handling without rewriting procurement or outbound fulfillment flows.

## Decision

Keep `Shipment` as the operational aggregate and use `ShipmentEvent` as an immutable append-only tracking log. Store current route, ETA, and latest-location fields on `Shipment` as query-friendly projections. Store derived delay/staleness records in `ShipmentException`.

Lifecycle endpoints append system events. Manual updates append manual events. Provider feeds can append provider events later without changing the API contract or lifecycle state machine.

## Consequences

Shipment detail pages can render quickly from one aggregate read while still preserving the full audit trail. Exceptions are deterministic derived state and can be recalculated or resolved without deleting history. The tradeoff is that writes must keep projections and event history in sync transactionally; the logistics service owns that responsibility.
