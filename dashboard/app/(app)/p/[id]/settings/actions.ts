"use server";

import { revalidatePath } from "next/cache";

import { ApiError, api, type Category, type DestinationKind } from "@/lib/api";

type Result<T = object> = ({ ok: true } & T) | { error: string };

function code(error: unknown): string {
  return error instanceof ApiError ? error.code : "unavailable";
}

export async function createKey(projectId: string): Promise<Result<{ public_key: string }>> {
  try {
    const { public_key } = await api.createKey(projectId);
    revalidatePath(`/p/${projectId}/settings`);
    return { ok: true, public_key };
  } catch (error) {
    return { error: code(error) };
  }
}

export async function revokeKey(projectId: string, keyId: string): Promise<Result> {
  try {
    await api.revokeKey(projectId, keyId);
    revalidatePath(`/p/${projectId}/settings`);
    return { ok: true };
  } catch (error) {
    return { error: code(error) };
  }
}

export async function addDestination(projectId: string, input: { kind: DestinationKind; url: string; secret: string; categories: Category[] }): Promise<Result> {
  try {
    await api.createDestination(projectId, { kind: input.kind, url: input.url.trim(), secret: input.secret.trim() || null, categories: input.categories });
    revalidatePath(`/p/${projectId}/settings`);
    return { ok: true };
  } catch (error) {
    return { error: code(error) };
  }
}

export async function toggleDestination(projectId: string, destId: string, enabled: boolean): Promise<Result> {
  try {
    await api.updateDestination(projectId, destId, { enabled });
    revalidatePath(`/p/${projectId}/settings`);
    return { ok: true };
  } catch (error) {
    return { error: code(error) };
  }
}

export async function removeDestination(projectId: string, destId: string): Promise<Result> {
  try {
    await api.deleteDestination(projectId, destId);
    revalidatePath(`/p/${projectId}/settings`);
    return { ok: true };
  } catch (error) {
    return { error: code(error) };
  }
}

export async function testDestination(projectId: string, destId: string): Promise<Result> {
  try {
    const result = await api.testDestination(projectId, destId);
    return result.ok ? { ok: true } : { error: result.error ?? "delivery_failed" };
  } catch (error) {
    return { error: code(error) };
  }
}

export async function saveProject(projectId: string, input: { name: string; bundle_id: string; retention_days: number }): Promise<Result> {
  try {
    await api.updateProject(projectId, { name: input.name.trim(), bundle_id: input.bundle_id.trim() || null, retention_days: input.retention_days });
    revalidatePath(`/p/${projectId}/settings`);
    revalidatePath(`/p/${projectId}`);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    return { error: code(error) };
  }
}
