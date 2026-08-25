"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiPatch, apiPost } from "@/lib/api";
import { describeError, type FormState } from "./errors";

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : undefined;
}

export async function createWarehouseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const payload = {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    address: emptyToUndefined(formData.get("address")),
    province: emptyToUndefined(formData.get("province")),
    country: emptyToUndefined(formData.get("country")),
  };

  let created: { id: string };
  try {
    created = await apiPost<{ id: string }>("/warehouses", payload);
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/warehouses");
  redirect(`/warehouses/${created.id}`);
}

export async function updateWarehouseAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const payload = {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    address: emptyToUndefined(formData.get("address")),
    province: emptyToUndefined(formData.get("province")),
    country: emptyToUndefined(formData.get("country")),
    status: String(formData.get("status") ?? "ACTIVE"),
  };

  try {
    await apiPatch(`/warehouses/${id}`, payload);
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/warehouses");
  revalidatePath(`/warehouses/${id}`);
  redirect(`/warehouses/${id}`);
}
