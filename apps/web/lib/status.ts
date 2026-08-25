import type { BadgeProps } from "@/components/ui/badge";

type Tone = NonNullable<BadgeProps["tone"]>;

const PO_STATUS_TONE: Record<string, Tone> = {
  DRAFT: "neutral",
  APPROVED: "info",
  SHIPPED: "accent",
  PARTIALLY_RECEIVED: "warning",
  RECEIVED: "success",
  CANCELLED: "danger",
};

const SHIPMENT_STATUS_TONE: Record<string, Tone> = {
  CREATED: "neutral",
  BOOKED: "info",
  IN_TRANSIT: "accent",
  ARRIVED: "warning",
  DELIVERED: "success",
  CANCELLED: "danger",
};

const SUPPLIER_STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  BLOCKED: "danger",
};

const WAREHOUSE_STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
};

export function poStatusTone(status: string): Tone {
  return PO_STATUS_TONE[status] ?? "neutral";
}

export function shipmentStatusTone(status: string): Tone {
  return SHIPMENT_STATUS_TONE[status] ?? "neutral";
}

export function supplierStatusTone(status: string): Tone {
  return SUPPLIER_STATUS_TONE[status] ?? "neutral";
}

export function warehouseStatusTone(status: string): Tone {
  return WAREHOUSE_STATUS_TONE[status] ?? "neutral";
}

export function formatStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}
