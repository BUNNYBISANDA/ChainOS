# Architecture docs

Phase 0.5 (engineering hardening) + phase 1 (inbound supply-chain vertical
slice) + phase 2 (outbound supply-chain vertical slice) docs. For the
domain model, module boundaries, and phased roadmap, see the
[ChainOS Manifest](https://claude.ai/code/artifact/af39c88f-4ab5-43e6-8081-b5b0abe99152)
— these docs cover how the pieces work, not the business domain.

- [authentication.md](./authentication.md) — request identity flow, JWT
  issuance, and the `apps/web` BFF layer built in phase 1.
- [rls.md](./rls.md) — how tenant isolation is actually enforced, and the
  one rule (non-superuser, non-owner DB role) that makes it real instead
  of decorative — plus a known gap in the current shared dev database.
- [errors.md](./errors.md) — the standardized API error response shape
  and how to raise a domain error with a stable code.
- [testing.md](./testing.md) — unit vs. integration split, the
  tenant-isolation and idempotency test suites, and what building them
  caught.
- [outbound-fulfillment.md](./outbound-fulfillment.md) — phase 2:
  Customer → Sales Order → Confirm → Allocate → Outbound Shipment →
  Fulfill, the reservation/fulfillment inventory invariants, and the
  phase 2 permission matrix.

See [../adr/](../adr/) for the *why* behind each of the above where a
real alternative was considered and rejected — including
[0004](../adr/0004-purchase-order-lifecycle.md) for the PO/shipment
state machines that drive the phase 1 inbound flow, and
[0005](../adr/0005-inventory-reservation-model.md)–[0007](../adr/0007-outbound-fulfillment-semantics.md)
for the phase 2 reservation model, concurrency strategy, and fulfillment
semantics.
