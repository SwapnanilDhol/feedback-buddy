import { describe, expect, it } from 'vitest';

import { displayPrefix, generatePublicKey, hashKey, looksLikePublicKey } from '../src/keys';

describe('public keys', () => {
  it('generates distinct fb_pub_ keys with a 12 character display prefix and sha256 hash', async () => {
    const first = await generatePublicKey();
    const second = await generatePublicKey();
    expect(first.plaintext).toMatch(/^fb_pub_[A-Za-z0-9_-]{24}$/);
    expect(first.plaintext).not.toBe(second.plaintext);
    expect(first.prefix).toBe(first.plaintext.slice(0, 12));
    expect(displayPrefix(first.plaintext)).toHaveLength(12);
    expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashKey(first.plaintext)).toBe(first.hash);
    expect(looksLikePublicKey(first.plaintext)).toBe(true);
    expect(looksLikePublicKey('fb_pub_short')).toBe(false);
    expect(looksLikePublicKey('fb_admin_x')).toBe(false);
  });
});
