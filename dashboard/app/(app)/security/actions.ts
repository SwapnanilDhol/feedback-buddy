"use server";

import { revalidatePath } from "next/cache";

import { ApiError, api } from "@/lib/api";

export async function removePasskey(id: string): Promise<{ ok: true } | { error: string }> {
  try {
    await api.deletePasskey(id);
  } catch (error) {
    return { error: error instanceof ApiError ? error.code : "unavailable" };
  }
  revalidatePath("/security");
  return { ok: true };
}
