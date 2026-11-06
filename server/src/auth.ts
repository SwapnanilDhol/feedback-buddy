import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

import { ApiError } from './http';
import { createSession, deleteSession, readSession } from './repository';
import { base64UrlDecode, base64UrlEncode, hmacSha256Hex, timingSafeEqual, verifyBearer } from './security';

export const sessionCookieName = 'fb_session';
const sessionTtlMs = 30 * 24 * 60 * 60 * 1000;

export type AppContext = Context<{ Bindings: Env; Variables: { sessionId?: string } }>;

export function isAdminBearer(context: AppContext): boolean {
  return verifyBearer(context.req.header('Authorization'), context.env.ADMIN_API_TOKEN);
}

export function verifyPassword(candidate: string, env: Env): boolean {
  return Boolean(env.ADMIN_PASSWORD) && timingSafeEqual(candidate, env.ADMIN_PASSWORD);
}

export async function signSessionId(id: string, secret: string): Promise<string> {
  return `${base64UrlEncode(id)}.${await hmacSha256Hex(secret, `session:${id}`)}`;
}

/** Returns the session id when the cookie value is well-formed and its signature matches. */
export async function verifySessionCookie(value: string | undefined, secret: string): Promise<string | null> {
  if (!value || !secret) return null;
  const separator = value.indexOf('.');
  if (separator <= 0) return null;
  const id = base64UrlDecode(value.slice(0, separator));
  if (!id) return null;
  const expected = await hmacSha256Hex(secret, `session:${id}`);
  return timingSafeEqual(value.slice(separator + 1), expected) ? id : null;
}

export async function resolveSession(context: AppContext): Promise<string | null> {
  const id = await verifySessionCookie(getCookie(context, sessionCookieName), context.env.SESSION_SECRET);
  if (!id) return null;
  const session = await readSession(context.env.DB, id);
  if (!session || session.expires_at <= new Date().toISOString()) return null;
  return id;
}

export async function startSession(context: AppContext): Promise<void> {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + sessionTtlMs);
  await createSession(context.env.DB, id, expiresAt.toISOString());
  setCookie(context, sessionCookieName, await signSessionId(id, context.env.SESSION_SECRET), {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function endSession(context: AppContext): Promise<void> {
  const id = await verifySessionCookie(getCookie(context, sessionCookieName), context.env.SESSION_SECRET);
  if (id) await deleteSession(context.env.DB, id);
  deleteCookie(context, sessionCookieName, { path: '/' });
}

/** Admin API: accept the operator bearer token or a valid dashboard session. */
export const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: { sessionId?: string } }> = async (context, next) => {
  if (isAdminBearer(context)) {
    await next();
    return;
  }
  const sessionId = await resolveSession(context);
  if (!sessionId) throw new ApiError(401, 'unauthorized');
  context.set('sessionId', sessionId);
  await next();
};

/** Dashboard pages: redirect anonymous visitors to the login form. */
export const requireSession: MiddlewareHandler<{ Bindings: Env; Variables: { sessionId?: string } }> = async (context, next) => {
  const sessionId = await resolveSession(context);
  if (!sessionId) {
    if (context.req.header('Accept')?.includes('application/json')) throw new ApiError(401, 'unauthorized');
    return context.redirect('/login', 302);
  }
  context.set('sessionId', sessionId);
  await next();
};

/** Browser-originated JSON posts must come from this origin (CSRF defence). */
export function requireSameOrigin(context: AppContext): void {
  const origin = context.req.header('Origin');
  if (!origin || origin !== new URL(context.req.url).origin) throw new ApiError(403, 'forbidden_origin');
}

// Login attempts are throttled per client address in isolate memory. This is
// best effort (isolates are not shared) and complements the password itself.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const loginWindowMs = 15 * 60 * 1000;
const loginLimit = 10;

export function recordLoginAttempt(address: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(address);
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(address, { count: 1, resetAt: now + loginWindowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= loginLimit;
}

export function clientAddress(context: AppContext): string {
  return context.req.header('CF-Connecting-IP') ?? context.req.header('X-Forwarded-For') ?? 'unknown';
}
