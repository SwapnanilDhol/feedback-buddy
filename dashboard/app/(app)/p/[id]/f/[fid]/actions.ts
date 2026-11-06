"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError, api, type Status } from "@/lib/api";

function refresh(projectId: string, feedbackId?: string) {
  revalidatePath("/");
  revalidatePath(`/p/${projectId}`);
  if (feedbackId) revalidatePath(`/p/${projectId}/f/${feedbackId}`);
}

export async function setStatus(projectId: string, feedbackId: string, status: Status): Promise<{ ok: true } | { error: string }> {
  try {
    await api.updateFeedback(feedbackId, { status });
  } catch (error) {
    return { error: error instanceof ApiError ? error.code : "unavailable" };
  }
  refresh(projectId, feedbackId);
  return { ok: true };
}

export async function saveNote(projectId: string, feedbackId: string, note: string): Promise<{ ok: true } | { error: string }> {
  try {
    await api.updateFeedback(feedbackId, { internal_note: note.trim() ? note.slice(0, 4000) : null });
  } catch (error) {
    return { error: error instanceof ApiError ? error.code : "unavailable" };
  }
  refresh(projectId, feedbackId);
  return { ok: true };
}

export async function redeliver(projectId: string, feedbackId: string): Promise<{ requeued: number } | { error: string }> {
  try {
    const result = await api.redeliver(feedbackId);
    refresh(projectId, feedbackId);
    return { requeued: result.requeued ?? 0 };
  } catch (error) {
    return { error: error instanceof ApiError ? error.code : "unavailable" };
  }
}

export async function deleteFeedback(projectId: string, feedbackId: string): Promise<{ error: string } | never> {
  try {
    await api.deleteFeedback(feedbackId);
  } catch (error) {
    return { error: error instanceof ApiError ? error.code : "unavailable" };
  }
  refresh(projectId);
  redirect(`/p/${projectId}`);
}
