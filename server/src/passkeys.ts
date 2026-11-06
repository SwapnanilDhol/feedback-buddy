import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

import { base64UrlDecode, base64UrlEncode, base64UrlToUtf8, hmacSha256Hex, timingSafeEqual, utf8ToBase64Url } from './security';

// ---------- Storage ----------

export interface PasskeyRow {
  id: string;
  rp_id: string | null;
  name: string;
  public_key: string;
  counter: number;
  transports_json: string;
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: number;
  created_at: string;
  last_used_at: string | null;
}

export interface Passkey {
  id: string;
  name: string;
  device_type: 'singleDevice' | 'multiDevice';
  backed_up: boolean;
  created_at: string;
  last_used_at: string | null;
}

export function toPasskey(row: PasskeyRow): Passkey {
  return {
    id: row.id,
    name: row.name,
    device_type: row.device_type,
    backed_up: row.backed_up === 1,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  };
}

/** Passkeys for one relying party (host); omit to list every host's. */
export async function listPasskeys(db: D1Database, rpId?: string): Promise<PasskeyRow[]> {
  const result = rpId
    ? await db.prepare('SELECT * FROM passkeys WHERE rp_id = ?1 ORDER BY created_at ASC').bind(rpId).all<PasskeyRow>()
    : await db.prepare('SELECT * FROM passkeys ORDER BY created_at ASC').all<PasskeyRow>();
  return result.results;
}

export async function countPasskeys(db: D1Database, rpId?: string): Promise<number> {
  const row = rpId
    ? await db.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE rp_id = ?1').bind(rpId).first<{ n: number }>()
    : await db.prepare('SELECT COUNT(*) AS n FROM passkeys').first<{ n: number }>();
  return row?.n ?? 0;
}

export async function readPasskey(db: D1Database, id: string): Promise<PasskeyRow | null> {
  return db.prepare('SELECT * FROM passkeys WHERE id = ?1').bind(id).first<PasskeyRow>();
}

export async function deletePasskey(db: D1Database, id: string): Promise<boolean> {
  const result = await db.prepare('DELETE FROM passkeys WHERE id = ?1').bind(id).run();
  return (result.meta.changes ?? 0) > 0;
}

async function insertPasskey(db: D1Database, row: PasskeyRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO passkeys (id, rp_id, name, public_key, counter, transports_json, device_type, backed_up, created_at, last_used_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)`,
    )
    .bind(row.id, row.rp_id, row.name, row.public_key, row.counter, row.transports_json, row.device_type, row.backed_up, row.created_at)
    .run();
}

async function touchPasskey(db: D1Database, id: string, counter: number): Promise<void> {
  await db
    .prepare('UPDATE passkeys SET counter = ?2, last_used_at = ?3 WHERE id = ?1')
    .bind(id, counter, new Date().toISOString())
    .run();
}

// ---------- Binary helpers ----------

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return base64UrlEncode(binary);
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  const binary = base64UrlDecode(value);
  if (binary === null) return null;
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function parseTransports(json: string): AuthenticatorTransportFuture[] {
  try {
    const parsed = JSON.parse(json) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is AuthenticatorTransportFuture => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

// ---------- Relying party ----------

export const relyingPartyName = 'FeedbackBuddy';
// One operator; the WebAuthn user handle only needs to be stable.
const operatorUserId: Uint8Array<ArrayBuffer> = new Uint8Array(new TextEncoder().encode('feedback-buddy-operator'));

export interface RelyingParty {
  rpID: string;
  origin: string;
}

/** The passkey is bound to the host the dashboard is served from. */
export function relyingParty(request: Request): RelyingParty {
  const url = new URL(request.url);
  return { rpID: url.hostname, origin: url.origin };
}

// ---------- Challenge cookie ----------
// The challenge lives in a short-lived signed cookie, so no table is needed
// and a challenge can only be redeemed by the browser that requested it.

export const challengeCookieName = 'fb_challenge';
export const challengeTtlMs = 5 * 60 * 1000;
export type ChallengeKind = 'registration' | 'authentication';

interface ChallengePayload {
  c: string;
  k: ChallengeKind;
  e: number;
}

export async function signChallenge(secret: string, challenge: string, kind: ChallengeKind, now = Date.now()): Promise<string> {
  const payload: ChallengePayload = { c: challenge, k: kind, e: now + challengeTtlMs };
  const encoded = utf8ToBase64Url(JSON.stringify(payload));
  return `${encoded}.${await hmacSha256Hex(secret, `challenge:${encoded}`)}`;
}

/** Returns the challenge when the cookie is intact, of the expected kind, and not expired. */
export async function verifyChallenge(secret: string, value: string | undefined, kind: ChallengeKind, now = Date.now()): Promise<string | null> {
  if (!value || !secret) return null;
  const separator = value.indexOf('.');
  if (separator <= 0) return null;
  const encoded = value.slice(0, separator);
  const expected = await hmacSha256Hex(secret, `challenge:${encoded}`);
  if (!timingSafeEqual(value.slice(separator + 1), expected)) return null;
  const decoded = base64UrlToUtf8(encoded);
  if (!decoded) return null;
  try {
    const payload = JSON.parse(decoded) as Partial<ChallengePayload>;
    if (typeof payload.c !== 'string' || payload.k !== kind || typeof payload.e !== 'number') return null;
    return payload.e > now ? payload.c : null;
  } catch {
    return null;
  }
}

// ---------- Ceremonies ----------

/**
 * Verification functions are called through this object so tests can replace
 * them without a real authenticator; production never touches it.
 */
export const verifiers = { verifyRegistrationResponse, verifyAuthenticationResponse };

export async function registrationOptions(db: D1Database, party: RelyingParty): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await listPasskeys(db, party.rpID);
  return generateRegistrationOptions({
    rpName: relyingPartyName,
    rpID: party.rpID,
    userName: 'operator',
    userDisplayName: 'FeedbackBuddy operator',
    userID: operatorUserId,
    attestationType: 'none',
    excludeCredentials: existing.map((row) => ({ id: row.id, transports: parseTransports(row.transports_json) })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });
}

export async function completeRegistration(
  db: D1Database,
  party: RelyingParty,
  expectedChallenge: string,
  name: string,
  response: RegistrationResponseJSON,
): Promise<Passkey | null> {
  const verification = await verifiers.verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: party.origin,
    expectedRPID: party.rpID,
    requireUserVerification: false,
  });
  if (!verification.verified || !verification.registrationInfo) return null;
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  const row: PasskeyRow = {
    id: credential.id,
    rp_id: party.rpID,
    name,
    public_key: bytesToBase64Url(credential.publicKey),
    counter: credential.counter,
    transports_json: JSON.stringify(credential.transports ?? []),
    device_type: credentialDeviceType,
    backed_up: credentialBackedUp ? 1 : 0,
    created_at: new Date().toISOString(),
    last_used_at: null,
  };
  await insertPasskey(db, row);
  return toPasskey(row);
}

export async function authenticationOptions(db: D1Database, party: RelyingParty): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const existing = await listPasskeys(db, party.rpID);
  return generateAuthenticationOptions({
    rpID: party.rpID,
    userVerification: 'preferred',
    allowCredentials: existing.map((row) => ({ id: row.id, transports: parseTransports(row.transports_json) })),
  });
}

export async function completeAuthentication(
  db: D1Database,
  party: RelyingParty,
  expectedChallenge: string,
  response: AuthenticationResponseJSON,
): Promise<Passkey | null> {
  const row = await readPasskey(db, response.id);
  if (!row || (row.rp_id && row.rp_id !== party.rpID)) return null;
  const publicKey = base64UrlToBytes(row.public_key);
  if (!publicKey) return null;
  const verification = await verifiers.verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: party.origin,
    expectedRPID: party.rpID,
    requireUserVerification: false,
    credential: { id: row.id, publicKey, counter: row.counter, transports: parseTransports(row.transports_json) },
  });
  if (!verification.verified) return null;
  await touchPasskey(db, row.id, verification.authenticationInfo.newCounter);
  return toPasskey(row);
}
