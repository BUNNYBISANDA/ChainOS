"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiPatch, apiPost } from "@/lib/api";
import { describeError, type FormState } from "./errors";

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : undefined;
}

export async function createProductAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const payload = {
    sku: String(formData.get("sku") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    description: emptyToUndefined(formData.get("description")),
    category: emptyToUndefined(formData.get("category")),
    uom: emptyToUndefined(formData.get("uom")) ?? "EACH",
    costPrice: Number(formData.get("costPrice") ?? 0),
  };

  let created: { id: string };
  try {
    created = await apiPost<{ id: string }>("/products", payload);
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/products");
  redirect(`/products/${created.id}`);
}

export async function updateProductAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const payload = {
    sku: String(formData.get("sku") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    description: emptyToUndefined(formData.get("description")),
    category: emptyToUndefined(formData.get("category")),
    uom: emptyToUndefined(formData.get("uom")) ?? "EACH",
    costPrice: Number(formData.get("costPrice") ?? 0),
    active: formData.get("active") === "on",
  };

  try {
    await apiPatch(`/products/${id}`, payload);
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  redirect(`/products/${id}`);
}
