# Shipment Visibility

ChainOS Phase 3 adds operational visibility on top of the existing shipment lifecycle. Shipments remain the workflow aggregate, while `shipment_events` is the immutable tracking log and `shipment_exceptions` is the derived exception register for work that needs attention.

## Data Model

`Shipment` now stores route and ETA projections:

- Origin, destination, and current location names.
- Optional latitude and longitude for origin, destination, and current location.
- Planned, estimated, and actual departure/arrival timestamps.
- `lastTrackingEventAt`, used to detect stale tracking.

`ShipmentEvent` stores each tracking fact:

- `eventType`: lifecycle, ETA, location, delay, or note event.
- `source`: `SYSTEM`, `MANUAL`, or future provider feed.
- `eventTimestamp`: when the event happened.
- Optional location, coordinates, notes, metadata, and creating user.

`ShipmentException` stores derived visibility problems:

- `ETA_EXCEEDED` when an active shipment has an ETA in the past.
- `TRACKING_STALE` when an active shipment has no recent tracking event.
- Exceptions are opened or updated during reads and shipment mutations, then resolved when the underlying condition clears or the shipment reaches a terminal state.

## API

Existing lifecycle endpoints still drive status changes:

- `POST /shipments/:id/book`
- `POST /shipments/:id/dispatch`
- `POST /shipments/:id/arrive`
- `POST /shipments/:id/deliver`
- `POST /shipments/:id/cancel`

Phase 3 adds:

- `GET /shipments/:id/events`
- `POST /shipments/:id/events`
- `POST /shipments/:id/eta`
- `GET /shipments/:id/exceptions`

List filters include direction, status, delayed, needs attention, exception status, and text search.

## Permissions

Phase 3 introduces:

- `shipment:tracking:create`
- `shipment:eta:update`
- `shipment:exceptions:read`

Existing `shipment:create` and `shipment:update` continue to gate creation and lifecycle transitions.

## Tenant Isolation

All new tables carry `tenantId`, are included in `rls.sql`, and are accessed through `withTenant`. The API resolves a shipment inside the current tenant before exposing tracking events or exceptions, so cross-tenant event reads and writes return `404`.

## Frontend

The shipment list is now a visibility dashboard with exception and delay filters. The shipment detail page shows route summary, ETA controls, open and resolved exceptions, a chronological tracking timeline, manual tracking updates, and a MapLibre map when coordinates are available.
