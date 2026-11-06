import type { Category, Status } from "@/lib/api";

export const statuses: Status[] = ["todo", "in_progress", "done", "wont_do"];
export const statusLabels: Record<Status, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  wont_do: "Won't Do",
};
export const categories: Category[] = ["feedback", "bug", "idea"];
export const categoryLabels: Record<Category, string> = { feedback: "Feedback", bug: "Bug", idea: "Idea" };

export function relativeTime(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return iso.slice(0, 10);
}

export function excerpt(message: string, length = 140): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
}

/** Stable hue per slug so each app keeps its colour everywhere. */
export function hue(slug: string): number {
  let hash = 0;
  for (const char of slug) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}

export function swiftSnippet(publicKeyPlaceholder: string, apiUrl: string, sdkDefault: string): string {
  const endpointArgument = apiUrl.replace(/\/+$/, "") === sdkDefault ? "" : `, endpoint: URL(string: "${apiUrl}")!`;
  return `import FeedbackBuddy

// At launch
FeedbackBuddy.configure(apiKey: "${publicKeyPlaceholder}"${endpointArgument})

// UIKit
FeedbackBuddy.present(from: viewController)
// SwiftUI
.feedbackBuddySheet(isPresented: $showFeedback)`;
}
