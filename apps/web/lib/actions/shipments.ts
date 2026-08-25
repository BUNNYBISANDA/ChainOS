"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "@/lib/api";
import { describeError } from "./errors";

export async function createInboundShipmentAction(purchaseOrderId: string): Promise<{ error?: string; id?: string }> {
  try {
    const shipment = await apiPost<{ id: string }>("/shipments", { direction: "INBOUND", purchaseOrderId });
    revalidatePath(`/purchase-orders/${purchaseOrderId}`);
    revalidatePath("/shipments");
    return { id: shipment.id };
  } catch (err) {
    return { error: describeError(err) };
  }
}

export async function createOutboundShipmentAction(salesOrderId: string): Promise<{ error?: string; id?: string }> {
  try {
    // originWarehouseId/destCustomerId are derived server-side from the SalesOrder — never sent by the client.
    const shipment = await apiPost<{ id: string }>("/shipments", { direction: "OUTBOUND", salesOrderId });
    revalidatePath(`/sales-orders/${salesOrderId}`);
    revalidatePath("/sales-orders");
    revalidatePath("/shipments");
    return { id: shipment.id };
  } catch (err) {
    return { error: describeError(err) };
  }
}

type ShipmentTransition = "book" | "dispatch" | "arrive" | "deliver" | "cancel";

export async function transitionShipmentAction(id: string, action: ShipmentTransition): Promise<{ error?: string }> {
  try {
    await apiPost(`/shipments/${id}/${action}`);
  } catch (err) {
    return { error: describeError(err) };
  }
  revalidatePath("/shipments");
  revalidatePath(`/shipments/${id}`);
  revalidatePath("/purchase-orders");
  revalidatePath("/sales-orders");
  return {};
}
