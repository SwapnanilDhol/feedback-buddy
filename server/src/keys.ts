import { randomUrlSafe, sha256Hex } from './security';

export const publicKeyPrefix = 'fb_pub_';
export const publicKeyPattern = /^fb_pub_[A-Za-z0-9_-]{22,64}$/;

export interface GeneratedKey {
  plaintext: string;
  hash: string;
  /** First 12 characters, safe to display. */
  prefix: string;
}

export async function generatePublicKey(): Promise<GeneratedKey> {
  const plaintext = `${publicKeyPrefix}${randomUrlSafe(24)}`;
  return { plaintext, hash: await hashKey(plaintext), prefix: displayPrefix(plaintext) };
}

export function hashKey(plaintext: string): Promise<string> {
  return sha256Hex(plaintext);
}

export function displayPrefix(plaintext: string): string {
  return plaintext.slice(0, 12);
}

export function looksLikePublicKey(value: string): boolean {
  return publicKeyPattern.test(value);
}
