/**
 * Central registry of cross-module domain events (manifest §2, fig. 2).
 * A module publishes by injecting Nest's EventEmitter2 and calling
 * `emitter.emit(DomainEvent.PoReceived, payload)`; it subscribes with
 * `@OnEvent(DomainEvent.PoReceived)`. No module may import another
 * module's service to call it directly for anything on this list —
 * that coupling is exactly what event-driven boundaries exist to avoid.
 */
export enum DomainEvent {
  PoIssued = "po.issued",
  PoReceived = "po.received",
  StockChanged = "stock.changed",
  StockLow = "stock.low",
  OrderReserved = "order.reserved",
  OrderReady = "order.ready",
  ShipmentDispatched = "shipment.dispatched",
  ShipmentDelivered = "shipment.delivered",
}

export interface PoReceivedPayload {
  tenantId: string;
  purchaseOrderId: string;
  warehouseId: string;
  lines: Array<{ purchaseOrderLineId: string; productId: string; qtyReceived: number }>;
}

export interface OrderReservedPayload {
  tenantId: string;
  customerOrderId: string;
  warehouseId: string;
  lines: Array<{ customerOrderLineId: string; productId: string; qty: number }>;
}

export interface OrderReadyPayload {
  tenantId: string;
  customerOrderId: string;
  warehouseId: string;
  lines: Array<{ customerOrderLineId: string; productId: string; qty: number }>;
}

export interface StockChangedPayload {
  tenantId: string;
  productId: string;
  warehouseId: string;
  quantityOnHand: number;
  quantityReserved: number;
}

export interface ShipmentDeliveredPayload {
  tenantId: string;
  shipmentId: string;
  purchaseOrderId?: string;
  customerOrderId?: string;
}
