"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiPost } from "@/lib/api";
import { describeError, type FormState } from "./errors";

interface LineInput {
  productId: string;
  qtyOrdered: number;
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
    if (productIds.has(line.productId)) {
      return { error: "Duplicate product lines are not allowed. Combine quantities for the same product." };
    }
    productIds.add(line.productId);
  }

  const payload = {
    customerId: String(formData.get("customerId") ?? ""),
    warehouseId: String(formData.get("warehouseId") ?? ""),
    lines,
  };

  if (!payload.customerId || !payload.warehouseId) {
    return { error: "Customer and warehouse are required." };
  }

  let created: { id: string };
  try {
    created = await apiPost<{ id: string }>("/customer-orders", payload);
  } catch (err) {
    return { error: describeSalesOrderError(err) };
  }

  revalidatePath("/sales-orders");
  redirect(`/sales-orders/${created.id}`);
}

export async function allocateSalesOrderAction(id: string): Promise<{ error?: string }> {
  try {
    await apiPost(`/customer-orders/${id}/reserve`);
  } catch (err) {
    return { error: describeSalesOrderError(err) };
  }
  revalidatePath("/sales-orders");
  revalidatePath(`/sales-orders/${id}`);
  revalidatePath("/inventory");
  return {};
}

export async function markSalesOrderReadyAction(id: string): Promise<{ error?: string }> {
  try {
    await apiPost(`/customer-orders/${id}/ready`);
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
  if (message.includes("available stock") || message.includes("Insufficient")) {
    return "Inventory is not sufficient to allocate this sales order. Check available stock and reduce the order quantity.";
  }
  if (message.includes("cannot be reserved")) {
    return "This sales order cannot be allocated from its current status.";
  }
  if (message.includes("cannot be marked ready")) {
    return "This sales order cannot be fulfilled from its current status.";
  }
  return message;
}
