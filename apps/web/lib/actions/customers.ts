"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiPatch, apiPost } from "@/lib/api";
import { describeError, type FormState } from "./errors";

interface CustomerPayload {
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
}

function payloadFromForm(formData: FormData): CustomerPayload | { error: string } {
  const companyName = String(formData.get("companyName") ?? "").trim();
  if (!companyName) {
    return { error: "Company name is required." };
  }
  return {
    companyName,
    contactName: emptyToUndefined(formData.get("contactName")),
    email: emptyToUndefined(formData.get("email")),
    phone: emptyToUndefined(formData.get("phone")),
    address: emptyToUndefined(formData.get("address")),
    city: emptyToUndefined(formData.get("city")),
    province: emptyToUndefined(formData.get("province")),
    country: emptyToUndefined(formData.get("country")),
  };
}

export async function createCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const payload = payloadFromForm(formData);
  if ("error" in payload) return payload;

  let created: { id: string };
  try {
    created = await apiPost<{ id: string }>("/customers", payload);
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/customers");
  redirect(`/customers/${created.id}`);
}

export async function updateCustomerAction(id: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const payload = payloadFromForm(formData);
  if ("error" in payload) return payload;

  try {
    await apiPatch(`/customers/${id}`, payload);
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}`);
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : undefined;
}
