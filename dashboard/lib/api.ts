import "server-only";

export type Category = "feedback" | "bug" | "idea";
export type Status = "todo" | "in_progress" | "done" | "wont_do";
export type StatusFilter = Status | "open";

export interface ProjectCounts {
  todo: number;
  in_progress: number;
  done: number;
  wont_do: number;
}

export interface Project {
  id: string;
  slug: string;
  key: string;
  name: string;
  bundle_id: string | null;
  icon_url: string | null;
  accent: string | null;
  retention_days: number;
  created_at: string;
  updated_at: string;
  counts?: ProjectCounts;
}

export type ProjectWithCounts = Project & { counts: ProjectCounts };

export interface Feedback {
  id: string;
  key: string;
  number: number;
  project_id: string;
  category: Category;
  status: Status;
  message: string;
  name: string | null;
  reply_email: string | null;
  context: {
    app_version: string;
    build_number: string;
    os_version: string;
    locale: string;
    device_family: string;
    device_model: string | null;
  };
  user: {
    id: string | null;
    account_status: "unknown" | "free" | "paid";
    plan: string | null;
    entitlements: string[];
    attributes: Record<string, string>;
  };
  attachment: { content_type: string; byte_count: number; url: string } | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  prefix: string;
  created_at: string;
  revoked_at: string | null;
}

export type DestinationKind = "slack_webhook" | "webhook" | "email";

export interface Destination {
  id: string;
  kind: DestinationKind;
  url: string;
  has_secret: boolean;
  categories: Category[];
  enabled: boolean;
  created_at: string;
}

export interface Delivery {
  id: string;
  destination_id: string;
  destination_kind: DestinationKind | null;
  status: "pending" | "delivered" | "failed" | "exhausted";
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface Passkey {
  id: string;
  name: string;
  device_type: "singleDevice" | "multiDevice";
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(`${status} ${code}`);
  }
}

export const SDK_DEFAULT_ENDPOINT = "https://feedback-buddy.swapnanildhol.workers.dev";

export function apiBaseUrl(): string {
  return (process.env.FEEDBACK_API_URL ?? SDK_DEFAULT_ENDPOINT).replace(/\/+$/, "");
}

function token(): string {
  const value = process.env.FEEDBACK_ADMIN_TOKEN;
  if (!value) throw new Error("FEEDBACK_ADMIN_TOKEN is not set");
  return value;
}

const headers = () => ({
  Authorization: `Bearer ${token()}`,
  Accept: "application/json",
  "User-Agent": "feedback-buddy-dashboard/0.1",
});

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: { ...headers(), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    let code = `http_${response.status}`;
    try {
      code = (JSON.parse(text) as { error?: string }).error ?? code;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(response.status, code);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export const api = {
  projects: () => request<{ projects: ProjectWithCounts[] }>("GET", "/api/v1/projects").then((r) => r.projects),
  project: (id: string) =>
    request<{ project: Project; keys: ApiKey[]; destinations: Destination[] }>("GET", `/api/v1/projects/${id}`),
  createProject: (input: { name: string; bundle_id?: string | null; retention_days?: number }) =>
    request<{ project: Project; public_key: string }>("POST", "/api/v1/projects", input),
  updateProject: (id: string, patch: { name?: string; bundle_id?: string | null; retention_days?: number }) =>
    request<{ project: Project }>("PATCH", `/api/v1/projects/${id}`, patch),
  createKey: (id: string) => request<{ key: ApiKey; public_key: string }>("POST", `/api/v1/projects/${id}/keys`),
  revokeKey: (id: string, keyId: string) => request<{ ok: true }>("DELETE", `/api/v1/projects/${id}/keys/${keyId}`),
  createDestination: (id: string, input: { kind: DestinationKind; url: string; secret?: string | null; categories: Category[] }) =>
    request<{ destination: Destination }>("POST", `/api/v1/projects/${id}/destinations`, input),
  updateDestination: (id: string, destId: string, patch: { enabled?: boolean }) =>
    request<{ destination: Destination }>("PATCH", `/api/v1/projects/${id}/destinations/${destId}`, patch),
  deleteDestination: (id: string, destId: string) => request<{ ok: true }>("DELETE", `/api/v1/projects/${id}/destinations/${destId}`),
  testDestination: (id: string, destId: string) =>
    request<{ ok: boolean; error?: string }>("POST", `/api/v1/projects/${id}/destinations/${destId}/test`),
  feedbackList: (id: string, query: { status?: StatusFilter; category?: Category; app_version?: string; q?: string; limit?: number; cursor?: string }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
    return request<{ feedback: Feedback[]; next_cursor: string | null }>("GET", `/api/v1/projects/${id}/feedback?${params}`);
  },
  feedback: (fid: string) => request<{ feedback: Feedback; deliveries: Delivery[] }>("GET", `/api/v1/feedback/${fid}`),
  updateFeedback: (fid: string, patch: { status?: Status; internal_note?: string | null }) =>
    request<{ feedback: Feedback }>("PATCH", `/api/v1/feedback/${fid}`, patch),
  deleteFeedback: (fid: string) => request<{ ok: true }>("DELETE", `/api/v1/feedback/${fid}`),
  redeliver: (fid: string) => request<{ ok: boolean; requeued?: number }>("POST", `/api/v1/feedback/${fid}/redeliver`),
  attachment: async (fid: string) => {
    const response = await fetch(`${apiBaseUrl()}/api/v1/feedback/${fid}/attachment`, { headers: headers(), cache: "no-store" });
    if (!response.ok) throw new ApiError(response.status, "attachment_unavailable");
    return response;
  },
  // Auth (operator endpoints on the Worker)
  checkPassword: (password: string) => request<{ ok: true }>("POST", "/api/v1/auth/password", { password }),
  /** Passkeys enrolled for one relying-party host (this dashboard), or every host when omitted. */
  passkeys: (rpId?: string) =>
    request<{ passkeys: Passkey[] }>("GET", `/api/v1/auth/passkeys${rpId ? `?rp_id=${encodeURIComponent(rpId)}` : ""}`).then((r) => r.passkeys),
  passkeyRegistrationOptions: (rp: { rp_id: string; origin: string }) =>
    request<Record<string, unknown> & { challenge: string }>("POST", "/api/v1/auth/passkeys/registration-options", rp),
  registerPasskey: (input: { rp_id: string; origin: string; challenge: string; name: string; response: unknown }) =>
    request<{ passkey: Passkey }>("POST", "/api/v1/auth/passkeys", input),
  deletePasskey: (id: string) => request<{ ok: true }>("DELETE", `/api/v1/auth/passkeys/${encodeURIComponent(id)}`),
  passkeyAuthenticationOptions: (rp: { rp_id: string; origin: string }) =>
    request<Record<string, unknown> & { challenge: string }>("POST", "/api/v1/auth/passkeys/authentication-options", rp),
  authenticatePasskey: (input: { rp_id: string; origin: string; challenge: string; response: unknown }) =>
    request<{ ok: true; passkey: { id: string; name: string } }>("POST", "/api/v1/auth/passkeys/authenticate", input),
};

/** Passkeys for this dashboard's host; degrades to "none" when the Worker does not expose the endpoint yet. */
export async function passkeysOrEmpty(rpId?: string): Promise<Passkey[]> {
  try {
    return await api.passkeys(rpId);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) return [];
    throw error;
  }
}
