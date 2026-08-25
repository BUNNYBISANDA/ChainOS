/**
 * Central registry of cross-module domain events (manifest §2, fig. 2).
 * A module publishes by injecting Nest's EventEmitter2 and calling
 * `emitter.emitAsync(DomainEvent.PoReceived, payload)`; it subscribes with
 * `@OnEvent(DomainEvent.PoReceived)`. No module may import another
 * module's service to call it directly for anything on this list —
 * that coupling is exactly what event-driven boundaries exist to avoid.
 *
 * Every payload that drives a state mutation carries a stable `eventId`
 * (crypto.randomUUID() at the point of emission). EventEmitter2 has no
 * built-in dedup or persistence — at-least-once redelivery (retry after a
 * handler throws, a caller re-emitting, etc.) is expected — so any handler
 * that mutates state MUST record `eventId` in `ProcessedEvent` in the same
 * transaction as the mutation and no-op on a duplicate. See
 * InventoryService for the reference implementation.
 */
export enum DomainEvent {
  PoApproved = "po.approved",
  PoReceived = "po.received",
  StockChanged = "stock.changed",
  StockLow = "stock.low",
  SalesOrderAllocated = "sales-order.allocated",
  SalesOrderFulfilled = "sales-order.fulfilled",
  ShipmentCreated = "shipment.created",
  ShipmentDispatched = "shipment.dispatched",
  ShipmentDelivered = "shipment.delivered",
}

export interface PoApprovedPayload {
  tenantId: string;
  purchaseOrderId: string;
  approvedByUserId: string;
  approvedAt: string;
}

/**
 * `receiptId` + `goodsReceiptLineId` per line trace each ledger movement
 * back to the exact GoodsReceipt(Line) that caused it, without Inventory
 * needing to read Procurement-owned tables to explain "why did this
 * change" — the ids are enough for that even though Inventory has no FK
 * to them (event payload fields, not Procurement table reads).
 */
export interface PoReceivedPayload {
  eventId: string;
  tenantId: string;
  purchaseOrderId: string;
  warehouseId: string;
  receiptId: string;
  receivedAt: string;
  lines: Array<{
    purchaseOrderLineId: string;
    goodsReceiptLineId: string;
    productId: string;
    qtyReceived: number;
  }>;
}

/**
 * Broadcast-only (see docs/adr/0006-reservation-concurrency-strategy.md) —
 * emitted after SalesOrdersService.allocate()'s transaction commits, for
 * observers. Reservation itself is a synchronous, same-transaction call
 * into InventoryService.reserveForSalesOrder(), not driven by this event.
 */
export interface SalesOrderAllocatedPayload {
  eventId: string;
  tenantId: string;
  salesOrderId: string;
  warehouseId: string;
  lines: Array<{ salesOrderLineId: string; productId: string; qty: number }>;
}

/**
 * Drives the actual ledger write (see docs/adr/0007-outbound-fulfillment-semantics.md)
 * — InventoryService.handleSalesOrderFulfilled posts the negative
 * StockMovement(s) this describes. `eventId` is claimed via the existing
 * claimEvent() idempotency guard, same as po.received.
 */
export interface SalesOrderFulfilledPayload {
  eventId: string;
  tenantId: string;
  salesOrderId: string;
  warehouseId: string;
  lines: Array<{ salesOrderLineId: string; productId: string; qty: number }>;
}

export interface StockChangedPayload {
  tenantId: string;
  productId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
}

/**
 * Emitted when a shipment is created and linked to a PO — Procurement
 * subscribes to transition that PO APPROVED -> SHIPPED (see
 * PurchaseOrdersService.handleShipmentCreated). Logistics never writes to
 * purchase_orders directly; this event is the only coupling.
 */
export interface ShipmentCreatedPayload {
  eventId: string;
  tenantId: string;
  shipmentId: string;
  purchaseOrderId?: string;
  salesOrderId?: string;
}

export interface ShipmentDeliveredPayload {
  tenantId: string;
  shipmentId: string;
  purchaseOrderId?: string;
  salesOrderId?: string;
}
