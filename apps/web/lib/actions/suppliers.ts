"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiPatch, apiPost } from "@/lib/api";
import { describeError, type FormState } from "./errors";

export async function createSupplierAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const payload = {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    country: emptyToUndefined(formData.get("country")),
    contactName: emptyToUndefined(formData.get("contactName")),
    email: emptyToUndefined(formData.get("email")),
    phone: emptyToUndefined(formData.get("phone")),
  };

  let created: { id: string };
  try {
    created = await apiPost<{ id: string }>("/suppliers", payload);
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/suppliers");
  redirect(`/suppliers/${created.id}`);
}

export async function updateSupplierAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const payload = {
    code: String(formData.get("code") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    country: emptyToUndefined(formData.get("country")),
    contactName: emptyToUndefined(formData.get("contactName")),
    email: emptyToUndefined(formData.get("email")),
    phone: emptyToUndefined(formData.get("phone")),
    status: String(formData.get("status") ?? "ACTIVE"),
  };

  try {
    await apiPatch(`/suppliers/${id}`, payload);
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  redirect(`/suppliers/${id}`);
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : undefined;
}
