"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiPost } from "@/lib/api";
import { describeError, type FormState } from "./errors";

export async function createCustomerAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = emptyToUndefined(formData.get("email"));

  if (!name) {
    return { error: "Company name is required." };
  }

  let created: { id: string };
  try {
    created = await apiPost<{ id: string }>("/customers", { name, email });
  } catch (err) {
    return { error: describeError(err) };
  }

  revalidatePath("/customers");
  redirect(`/customers/${created.id}`);
}

export async function updateCustomerAction(): Promise<FormState> {
  return { error: "Customer editing is waiting on the Phase 2 backend update endpoint." };
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : undefined;
}
