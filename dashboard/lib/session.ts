export const SESSION_COOKIE = "fbd_session";
export const CHALLENGE_COOKIE = "fbd_challenge";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const encoder = new TextEncoder();

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function sessionSecret(): string {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret || secret.length < 16) throw new Error("DASHBOARD_SESSION_SECRET must be set (16+ characters)");
  return secret;
}

/** `<expiresMs>.<hmac>` — verifiable in the proxy with Web Crypto only. */
export async function createSessionValue(now = Date.now()): Promise<{ value: string; expires: Date }> {
  const expires = now + SESSION_TTL_MS;
  return { value: `${expires}.${await hmacHex(sessionSecret(), `session:${expires}`)}`, expires: new Date(expires) };
}

export async function verifySessionValue(value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const [expiresRaw, signature] = value.split(".");
  if (!expiresRaw || !signature) return false;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires <= now) return false;
  return timingSafeEqual(signature, await hmacHex(sessionSecret(), `session:${expires}`));
}

/** WebAuthn challenge, kept in a 5-minute signed cookie between options and verify. */
export async function createChallengeValue(challenge: string, kind: "registration" | "authentication", now = Date.now()): Promise<string> {
  const expires = now + 5 * 60 * 1000;
  const payload = btoa(JSON.stringify({ c: challenge, k: kind, e: expires })).replace(/=+$/, "");
  return `${payload}.${await hmacHex(sessionSecret(), `challenge:${payload}`)}`;
}

export async function readChallengeValue(value: string | undefined, kind: "registration" | "authentication", now = Date.now()): Promise<string | null> {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  if (!timingSafeEqual(signature, await hmacHex(sessionSecret(), `challenge:${payload}`))) return null;
  try {
    const parsed = JSON.parse(atob(payload)) as { c?: string; k?: string; e?: number };
    if (typeof parsed.c !== "string" || parsed.k !== kind || typeof parsed.e !== "number" || parsed.e <= now) return null;
    return parsed.c;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  expires,
});

export const challengeCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 300,
});
