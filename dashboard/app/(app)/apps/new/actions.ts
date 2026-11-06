"use server";

import { revalidatePath } from "next/cache";

import { ApiError, api } from "@/lib/api";

export async function createProject(input: { name: string; bundle_id: string; retention_days: number }): Promise<{ id: string; public_key: string } | { error: string }> {
  try {
    const { project, public_key } = await api.createProject({ name: input.name.trim(), bundle_id: input.bundle_id.trim() || null, retention_days: input.retention_days });
    revalidatePath("/", "layout");
    return { id: project.id, public_key };
  } catch (error) {
    return { error: error instanceof ApiError ? error.code : "unavailable" };
  }
}
