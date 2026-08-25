export interface Supplier {
  id: string;
  code: string;
  name: string;
  country: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  status: "ACTIVE" | "INACTIVE" | "BLOCKED";
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
  status: WarehouseStatus;
  createdAt: string;
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

export interface ShipmentEvent {
  id: string;
  status: ShipmentStatus;
  note: string | null;
  occurredAt: string;
}

export interface Shipment {
  id: string;
  shipmentNumber: string;
  direction: ShipmentDirection;
  status: ShipmentStatus;
  purchaseOrderId: string | null;
  customerOrderId: string | null;
  originWarehouseId: string | null;
  destWarehouseId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  createdAt: string;
  events?: ShipmentEvent[];
  purchaseOrder?: PurchaseOrder & { supplier?: Supplier };
  destWarehouse?: Warehouse;
  originWarehouse?: Warehouse;
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
  customerOrderLineId: string | null;
  note: string | null;
  createdByUserId: string | null;
  createdAt: string;
  product: Product;
  warehouse: Warehouse;
}
