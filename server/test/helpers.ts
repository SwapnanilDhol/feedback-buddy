import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { vi } from 'vitest';

import worker from '../src/index';

export const adminHeaders = { Authorization: `Bearer ${env.ADMIN_API_TOKEN}` };

export async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`https://feedback.test${path}`, init), env, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export async function callJson<T = unknown>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T; response: Response }> {
  const response = await call(path, init);
  const body = (await response.json()) as T;
  return { status: response.status, body, response };
}

export interface CreatedProject {
  id: string;
  slug: string;
  name: string;
  public_key: string;
}

export async function createProject(name = `Project ${crypto.randomUUID().slice(0, 8)}`): Promise<CreatedProject> {
  const { status, body } = await callJson<{ project: { id: string; slug: string; name: string }; public_key: string }>('/api/v1/projects', {
    method: 'POST',
    headers: { ...adminHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (status !== 201) throw new Error(`project creation failed with ${status}`);
  return { ...body.project, public_key: body.public_key };
}

export const validSubmission = {
  schema_version: 1,
  category: 'bug',
  message: 'The wind card clips when gusts are shown.',
  context: { app_version: '5.0', build_number: '400', os_version: '26.0', locale: 'en-IN', device_family: 'iPhone' },
};

export function ingestHeaders(publicKey: string, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    Authorization: `Bearer ${publicKey}`,
    'X-Feedback-Installation-ID': '11111111-1111-4111-8111-111111111111',
    'Idempotency-Key': crypto.randomUUID(),
    'Content-Type': 'application/json',
    ...overrides,
  };
}

export async function submit(publicKey: string, payload: unknown = validSubmission, headerOverrides: Record<string, string> = {}) {
  return callJson<{ feedback_id: string; duplicate: boolean; delivery_status: string; error?: string }>('/v1/feedback', {
    method: 'POST',
    headers: ingestHeaders(publicKey, headerOverrides),
    body: JSON.stringify(payload),
  });
}

export function fakeJpeg(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

export function fakePng(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return bytes;
}

export function multipart(payload: unknown, attachment: Uint8Array, contentType = 'image/jpeg'): FormData {
  const form = new FormData();
  form.set('payload', JSON.stringify(payload));
  form.set('attachment', new File([attachment], 'feedback.jpg', { type: contentType }));
  return form;
}

export async function submitMultipart(publicKey: string, form: FormData, headerOverrides: Record<string, string> = {}) {
  const headers = ingestHeaders(publicKey, headerOverrides);
  delete headers['Content-Type'];
  return callJson<{ feedback_id: string; duplicate: boolean; delivery_status: string; error?: string }>('/v1/feedback', {
    method: 'POST',
    headers,
    body: form,
  });
}

export async function login(password = 'test-password'): Promise<{ response: Response; cookie: string }> {
  const form = new URLSearchParams({ password });
  const response = await call('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const setCookie = response.headers.get('Set-Cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  return { response, cookie };
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * Replaces the global fetch used by destination delivery. Each call pops the
 * next queued response; unmatched calls fail the test loudly.
 */
export function mockOutbound(responses: Array<() => Response>): { requests: RecordedRequest[]; restore: () => void } {
  const requests: RecordedRequest[] = [];
  const queue = [...responses];
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries([...request.headers.entries()].map(([key, value]) => [key.toLowerCase(), value])),
      body: await request.text(),
    });
    const next = queue.shift();
    if (!next) throw new Error(`unexpected outbound request to ${request.url}`);
    return next();
  });
  vi.stubGlobal('fetch', stub);
  return { requests, restore: () => vi.unstubAllGlobals() };
}
