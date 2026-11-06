const encoder = new TextEncoder();

export function timingSafeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.byteLength, b.byteLength);
  let difference = a.byteLength ^ b.byteLength;
  for (let index = 0; index < length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export function verifyBearer(authorization: string | undefined, expected: string | undefined): boolean {
  if (!authorization?.startsWith('Bearer ') || !expected) return false;
  return timingSafeEqual(authorization.slice(7), expected);
}

export function bearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice(7).trim();
  return token.length > 0 ? token : null;
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

const urlSafeAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** Uniform random string over the 64-character URL-safe alphabet. */
export function randomUrlSafe(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let output = '';
  for (const byte of bytes) output += urlSafeAlphabet[byte & 63];
  return output;
}

export function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

/** UTF-8 safe variant for arbitrary text (cookie payloads); `base64UrlEncode` is for Latin-1/binary strings. */
export function utf8ToBase64Url(value: string): string {
  let binary = '';
  for (const byte of encoder.encode(value)) binary += String.fromCharCode(byte);
  return base64UrlEncode(binary);
}

export function base64UrlToUtf8(value: string): string | null {
  const binary = base64UrlDecode(value);
  if (binary === null) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return null;
  }
}
