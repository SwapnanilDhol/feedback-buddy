"use server";

import { redirect } from "next/navigation";

import { ApiError, api } from "@/lib/api";
import { startSession } from "@/lib/auth-helpers";

export type LoginState = { error?: string };

export async function loginWithPassword(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!password) return { error: "Enter the password." };
  try {
    await api.checkPassword(password);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { error: "That password is not right." };
    if (error instanceof ApiError && error.status === 429) return { error: "Too many attempts. Try again in a few minutes." };
    return { error: "Could not reach the FeedbackBuddy API." };
  }
  await startSession();
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}
