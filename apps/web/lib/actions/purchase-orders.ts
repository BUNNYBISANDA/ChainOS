"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiPost } from "@/lib/api";
import { describeError, type FormState } from "./errors";

interface LineInput {
  productId: string;
  qtyOrdered: number;
  unitCost: number;
}

export async function createPurchaseOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const linesJson = String(formData.get("linesJson") ?? "[]");
  let lines: LineInput[];
  try {
    lines = JSON.parse(linesJson);
  } catch {
    return { error: "Could not read the product lines — please re-add them." };
  }
  if (lines.length === 0) {
    return { error: "Add at least one product line before creating the purchase order." };
  }

  const expectedDeliveryDate = String(formData.get("expectedDeliveryDate") ?? "").trim();
  const payload = {
    supplierId: String(formData.get("supplierId") ?? ""),
    warehouseId: String(formData.get("warehouseId") ?? ""),
    currency: String(formData.get("currency") ?? "THB"),
    notes: String(formData.get("notes") ?? "").trim() || undefined,
    expectedDeliveryDate: expectedDeliveryDate ? new Date(expectedDeliveryDate).toISOString() : undefined,
    lines,
  };

  let created: { id: string };
  try {
    created = await apiPost<{ id: string }>("/purchase-orders", payload);
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/purchase-orders");
  redirect(`/purchase-orders/${created.id}`);
}

export async function approvePurchaseOrderAction(id: string): Promise<{ error?: string }> {
  try {
    await apiPost(`/purchase-orders/${id}/approve`);
  } catch (err) {
    return { error: describeError(err) };
  }
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  return {};
}

export async function cancelPurchaseOrderAction(id: string): Promise<{ error?: string }> {
  try {
    await apiPost(`/purchase-orders/${id}/cancel`);
  } catch (err) {
    return { error: describeError(err) };
  }
  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  return {};
}

export interface ReceiveLineInput {
  purchaseOrderLineId: string;
  qtyReceived: number;
}

export async function receivePurchaseOrderAction(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const linesJson = String(formData.get("linesJson") ?? "[]");
  let lines: ReceiveLineInput[];
  try {
    lines = JSON.parse(linesJson);
  } catch {
    return { error: "Could not read the receiving quantities — please try again." };
  }
  lines = lines.filter((l) => l.qtyReceived > 0);
  if (lines.length === 0) {
    return { error: "Enter a quantity greater than zero for at least one line." };
  }

  try {
    await apiPost(`/purchase-orders/${id}/receive`, { lines });
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/purchase-orders");
  revalidatePath(`/purchase-orders/${id}`);
  revalidatePath("/inventory");
  redirect(`/purchase-orders/${id}`);
}
