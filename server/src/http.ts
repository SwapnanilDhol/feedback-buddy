import { HTTPException } from 'hono/http-exception';

export class ApiError extends HTTPException {
  constructor(status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 503, code: string) {
    super(status, { message: code });
  }
}

export async function readLimitedRequestText(request: Request, maximumBytes: number): Promise<string> {
  const declared = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declared) && declared > maximumBytes) {
    throw new ApiError(413, 'payload_too_large');
  }
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel('payload_too_large');
        throw new ApiError(413, 'payload_too_large');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export function parseJsonObject(text: string): Record<string, unknown> {
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new ApiError(422, 'invalid_json');
  }
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new ApiError(422, 'invalid_json');
  }
  return decoded as Record<string, unknown>;
}

export async function readLimitedRequestJson(request: Request, maximumBytes: number): Promise<Record<string, unknown>> {
  return parseJsonObject(await readLimitedRequestText(request, maximumBytes));
}

export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && uuidPattern.test(value);
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Absolute origin used for capability URLs and the integration snippet. */
export function publicBaseUrl(env: Env, request: Request): string {
  const configured = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  return new URL(request.url).origin;
}
