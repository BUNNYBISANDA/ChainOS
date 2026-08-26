export interface Supplier {
  id: string;
  code: string;
  name: string;
  country: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
  latitude: string | number | null;
  longitude: string | number | null;
  createdAt: string;
}

export interface SupplierDetail extends Supplier {
  purchaseOrders: Array<{
    id: string;
    poNumber: string;
    status: PurchaseOrderStatus;
    orderDate: string;
    currency: string;
    totalValue: number;
  }>;
  outstandingValue: number;
  orderCount: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  uom: string;
  costPrice: string;
  active: boolean;
  createdAt: string;
}

export type WarehouseStatus = "ACTIVE" | "INACTIVE";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address: string | null;
  province: string | null;
  country: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  status: WarehouseStatus;
  createdAt: string;
}

export type CustomerStatus = "ACTIVE" | "INACTIVE" | "BLOCKED";

export interface Customer {
  id: string;
  customerCode: string;
  companyName: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
}

export type SalesOrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "ALLOCATED"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "CANCELLED";

export interface SalesOrderLine {
  id: string;
  productId: string;
  qtyOrdered: number;
  qtyReserved: number;
  qtyFulfilled: number;
  unitPrice: string;
  remaining?: number;
  lineTotal?: number;
  product?: Product;
}

export interface SalesOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  warehouseId: string;
  status: SalesOrderStatus;
  currency: string;
  notes: string | null;
  orderDate: string;
  requestedDeliveryDate: string | null;
  confirmedByUserId: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  customer?: Customer;
  warehouse?: Warehouse;
  lines: SalesOrderLine[];
  shipment?: Shipment | null;
  totalValue?: number;
}

export type PurchaseOrderStatus = "DRAFT" | "APPROVED" | "SHIPPED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

export interface PurchaseOrderLine {
  id: string;
  productId: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: string;
  remaining?: number;
  lineTotal?: number;
  product?: Product;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  warehouseId: string;
  status: PurchaseOrderStatus;
  currency: string;
  notes: string | null;
  orderDate: string;
  expectedDeliveryDate: string | null;
  approvedByUserId: string | null;
  approvedAt: string | null;
  createdAt: string;
  lines: PurchaseOrderLine[];
  supplier?: Supplier;
  warehouse?: Warehouse;
  shipment?: Shipment | null;
  goodsReceipts?: GoodsReceipt[];
  totalValue?: number;
  receivedValue?: number;
}

export interface GoodsReceiptLine {
  id: string;
  purchaseOrderLineId: string;
  productId: string;
  qtyReceived: number;
}

export interface GoodsReceipt {
  id: string;
  purchaseOrderId: string;
  warehouseId: string;
  receivedByUserId: string | null;
  receivedAt: string;
  lines: GoodsReceiptLine[];
}

export type ShipmentStatus = "CREATED" | "BOOKED" | "IN_TRANSIT" | "ARRIVED" | "DELIVERED" | "CANCELLED";
export type ShipmentDirection = "INBOUND" | "OUTBOUND";
export type ShipmentEventType =
  | "CREATED"
  | "BOOKED"
  | "DISPATCHED"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "DELIVERED"
  | "CANCELLED"
  | "DELAYED"
  | "ETA_UPDATED"
  | "LOCATION_UPDATED"
  | "NOTE_ADDED";
export type TrackingEventSource = "SYSTEM" | "MANUAL" | "PROVIDER";
export type ShipmentExceptionType = "ETA_EXCEEDED" | "TRACKING_STALE" | "NOT_DISPATCHED" | "ARRIVAL_OVERDUE";
export type ShipmentExceptionSeverity = "INFO" | "WARNING" | "CRITICAL";
export type ShipmentExceptionStatus = "OPEN" | "RESOLVED";

export interface ShipmentEvent {
  id: string;
  status: ShipmentStatus | null;
  eventType: ShipmentEventType;
  eventTimestamp: string;
  locationName: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  source: TrackingEventSource;
  note: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdByUserId: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface ShipmentException {
  id: string;
  shipmentId: string;
  type: ShipmentExceptionType;
  severity: ShipmentExceptionSeverity;
  status: ShipmentExceptionStatus;
  detectedAt: string;
  resolvedAt: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  direction: ShipmentDirection;
  status: ShipmentStatus;
  purchaseOrderId: string | null;
  salesOrderId: string | null;
  originWarehouseId: string | null;
  destWarehouseId: string | null;
  destCustomerId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  originName: string | null;
  originLatitude: string | number | null;
  originLongitude: string | number | null;
  destinationName: string | null;
  destinationLatitude: string | number | null;
  destinationLongitude: string | number | null;
  currentLocationName: string | null;
  currentLatitude: string | number | null;
  currentLongitude: string | number | null;
  plannedDepartureAt: string | null;
  plannedArrivalAt: string | null;
  actualDepartureAt: string | null;
  actualArrivalAt: string | null;
  deliveredAt: string | null;
  estimatedArrivalAt: string | null;
  lastTrackingEventAt: string | null;
  createdAt: string;
  events?: ShipmentEvent[];
  exceptions?: ShipmentException[];
  purchaseOrder?: PurchaseOrder & { supplier?: Supplier };
  salesOrder?: SalesOrder & { customer?: Customer };
  destWarehouse?: Warehouse;
  originWarehouse?: Warehouse;
  destCustomer?: Customer;
}

export interface StockLevel {
  id: string;
  productId: string;
  warehouseId: string;
  locationId: string | null;
  quantityOnHand: number;
  quantityReserved: number;
  product: Product;
  warehouse: Warehouse;
}

export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  type: "RECEIPT" | "FULFILLMENT" | "ADJUSTMENT" | "TRANSFER";
  quantityDelta: number;
  purchaseOrderLineId: string | null;
  goodsReceiptLineId: string | null;
  salesOrderLineId: string | null;
  note: string | null;
  createdByUserId: string | null;
  createdAt: string;
  product: Product;
  warehouse: Warehouse;
}

// ---------------------------------------------------------------------
// Analytics (phase 4) — see docs/analytics/kpi-definitions.md
// ---------------------------------------------------------------------

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProcurementSummary {
  openPurchaseOrders: number;
  openPurchaseOrderValue: number;
  overduePurchaseOrders: number;
  partiallyReceivedPurchaseOrders: number;
}

export interface PoValueTrendPoint {
  bucket: string;
  value: number;
}

export type InventoryRiskLevel = "STOCKOUT" | "PROJECTED_STOCKOUT" | "HEALTHY";

export interface InventoryRiskRow {
  productId: string;
  sku: string;
  productName: string;
  warehouseId: string;
  warehouseName: string;
  onHand: number;
  reserved: number;
  available: number;
  incoming: number;
  demand: number;
  projected: number;
  riskLevel: InventoryRiskLevel;
}

export interface InventorySummary {
  inventoryValue: number;
  productsMissingCost: number;
  skusZeroAvailable: number;
  skusAtRisk: number;
}

export interface InventoryMovementPoint {
  bucket: string;
  inbound: number;
  outbound: number;
  net: number;
}

export interface FulfillmentSummary {
  openSalesOrders: number;
  awaitingAllocation: number;
  partiallyFulfilled: number;
  fulfilled: number;
  customerOtifPercent: number | null;
  otifEligibleOrders: number;
  otifSuccessfulOrders: number;
  ordersMissingRequestedDate: number;
}

export interface OtifTrendPoint {
  bucket: string;
  eligible: number;
  successful: number;
  otifPercent: number | null;
}

export interface LogisticsSummary {
  activeShipments: number;
  inboundActive: number;
  outboundActive: number;
  delayedShipments: number;
  needsAttentionShipments: number;
  avgTransitHours: number | null;
  onTimeDeliveryPercent: number | null;
}

export interface SupplierPerformanceRow {
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  poCount: number;
  totalSpend: number;
  openPoCount: number;
  latePoCount: number;
  avgLeadTimeDays: number | null;
  onTimePercent: number | null;
  otifPercent: number | null;
}

export type ExceptionDomain = "PROCUREMENT" | "INVENTORY" | "FULFILLMENT" | "LOGISTICS";
export type ExceptionSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface ExceptionItem {
  id: string;
  domain: ExceptionDomain;
  type: string;
  severity: ExceptionSeverity;
  message: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  detectedAt: string;
  href: string;
}

export interface DataQualityIssue {
  key: string;
  label: string;
  count: number;
}

export interface NetworkPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export interface NetworkShipmentPoint {
  id: string;
  shipmentNumber: string;
  direction: ShipmentDirection;
  status: ShipmentStatus;
  latitude: number;
  longitude: number;
}

export interface ControlTowerSummary {
  period: { from: string; to: string; preset: string };
  warehouseId: string | null;
  lastUpdated: string;
  procurement: ProcurementSummary;
  inventory: InventorySummary;
  fulfillment: FulfillmentSummary;
  logistics: LogisticsSummary;
  service: { customerOtifPercent: number | null };
  exceptions: { critical: number; warning: number; top: ExceptionItem[] };
  topSuppliers: SupplierPerformanceRow[];
  dataQuality: { total: number; issues: DataQualityIssue[] };
  network: {
    suppliers: NetworkPoint[];
    warehouses: NetworkPoint[];
    customers: NetworkPoint[];
    activeShipments: NetworkShipmentPoint[];
  };
}
