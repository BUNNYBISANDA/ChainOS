"use server";

import { revalidatePath } from "next/cache";
import { apiPost } from "@/lib/api";
import { describeError } from "./errors";
import type { FormState } from "./errors";

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

export async function addShipmentTrackingEventAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const eventType = String(formData.get("eventType") ?? "");
  const eventTimestamp = String(formData.get("eventTimestamp") ?? "");
  const locationName = emptyToUndefined(formData.get("locationName"));
  const latitude = emptyToUndefined(formData.get("latitude"));
  const longitude = emptyToUndefined(formData.get("longitude"));
  const notes = emptyToUndefined(formData.get("notes"));

  if (!eventType) return { error: "Choose a tracking event type." };
  if (latitude && !longitude) return { error: "Longitude is required when latitude is entered." };
  if (longitude && !latitude) return { error: "Latitude is required when longitude is entered." };

  try {
    await apiPost(`/shipments/${id}/events`, {
      eventType,
      eventTimestamp: eventTimestamp ? new Date(eventTimestamp).toISOString() : undefined,
      locationName,
      latitude,
      longitude,
      notes,
    });
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/shipments");
  revalidatePath(`/shipments/${id}`);
  return {};
}

export async function updateShipmentEtaAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const estimatedArrivalAt = String(formData.get("estimatedArrivalAt") ?? "");
  const notes = emptyToUndefined(formData.get("notes"));
  if (!estimatedArrivalAt) return { error: "Enter the new ETA." };

  try {
    await apiPost(`/shipments/${id}/eta`, { estimatedArrivalAt: new Date(estimatedArrivalAt).toISOString(), notes });
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/shipments");
  revalidatePath(`/shipments/${id}`);
  return {};
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : undefined;
}
