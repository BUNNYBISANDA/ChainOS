"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiPost } from "@/lib/api";
import { describeError, type FormState } from "./errors";

interface LineInput {
  productId: string;
  qtyOrdered: number;
  unitPrice: number;
}

export async function createSalesOrderAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const linesJson = String(formData.get("linesJson") ?? "[]");
  let lines: LineInput[];
  try {
    lines = JSON.parse(linesJson);
  } catch {
    return { error: "Could not read the product lines. Please re-add them." };
  }

  if (lines.length === 0) {
    return { error: "Add at least one product line before creating the sales order." };
  }

  const productIds = new Set<string>();
  for (const line of lines) {
    if (!line.productId || !Number.isInteger(line.qtyOrdered) || line.qtyOrdered <= 0) {
      return { error: "Every line needs a product and a quantity greater than zero." };
    }
    if (!(line.unitPrice >= 0)) {
      return { error: "Every line needs a unit price of zero or more." };
    }
    if (productIds.has(line.productId)) {
      return { error: "Duplicate product lines are not allowed. Combine quantities for the same product." };
    }
    productIds.add(line.productId);
  }

  const requestedDeliveryDate = String(formData.get("requestedDeliveryDate") ?? "").trim();

  const payload = {
    customerId: String(formData.get("customerId") ?? ""),
    warehouseId: String(formData.get("warehouseId") ?? ""),
    currency: String(formData.get("currency") ?? "THB").trim() || "THB",
    notes: emptyToUndefined(formData.get("notes")),
    requestedDeliveryDate: requestedDeliveryDate || undefined,
    lines,
  };

  if (!payload.customerId || !payload.warehouseId) {
    return { error: "Customer and warehouse are required." };
  }

  let created: { id: string };
  try {
    created = await apiPost<{ id: string }>("/sales-orders", payload);
  } catch (err) {
    return { error: describeSalesOrderError(err) };
  }

  revalidatePath("/sales-orders");
  redirect(`/sales-orders/${created.id}`);
}

export async function confirmSalesOrderAction(id: string): Promise<{ error?: string }> {
  try {
    await apiPost(`/sales-orders/${id}/confirm`);
  } catch (err) {
    return { error: describeSalesOrderError(err) };
  }
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${id}`);
  return {};
}

export async function allocateSalesOrderAction(id: string): Promise<{ error?: string }> {
  try {
    await apiPost(`/sales-orders/${id}/allocate`);
  } catch (err) {
    return { error: describeSalesOrderError(err) };
  }
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${id}`);
  revalidatePath("/inventory");
  return {};
}

export async function cancelSalesOrderAction(id: string): Promise<{ error?: string }> {
  try {
    await apiPost(`/sales-orders/${id}/cancel`);
  } catch (err) {
    return { error: describeSalesOrderError(err) };
  }
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${id}`);
  revalidatePath("/inventory");
  return {};
}

/** `lines` is per-line fulfillment quantities for this call only — partial fulfillment is calling this more than once with less than the full remaining quantity. */
export async function fulfillSalesOrderAction(
  id: string,
  lines: Array<{ salesOrderLineId: string; qty: number }>,
): Promise<{ error?: string }> {
  try {
    await apiPost(`/sales-orders/${id}/fulfill`, { lines });
  } catch (err) {
    return { error: describeSalesOrderError(err) };
  }
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${id}`);
  revalidatePath("/inventory");
  revalidatePath("/inventory/ledger");
  return {};
}

function describeSalesOrderError(err: unknown): string {
  const message = describeError(err);
  if (message.includes("available")) {
    return "Inventory is not sufficient to allocate this sales order. Check available stock and reduce the order quantity.";
  }
  if (message.includes("cannot move from") || message.includes("cannot be fulfilled") || message.includes("exceed the reserved")) {
    return message;
  }
  return message;
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : undefined;
}
