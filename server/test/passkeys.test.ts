import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  challengeTtlMs,
  listPasskeys,
  signChallenge,
  verifiers,
  verifyChallenge,
} from '../src/passkeys';
import { call, callJson, login } from './helpers';

const origin = 'https://feedback.test';
const originalVerifiers = { ...verifiers };

function cookieOf(response: Response, name: string): string {
  const header = response.headers.get('Set-Cookie') ?? '';
  const match = header.split(/,(?=\s*\w+=)/).map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
  return match?.split(';')[0] ?? '';
}

afterEach(() => {
  verifiers.verifyRegistrationResponse = originalVerifiers.verifyRegistrationResponse;
  verifiers.verifyAuthenticationResponse = originalVerifiers.verifyAuthenticationResponse;
});

describe('passkey challenge cookie', () => {
  const secret = 'challenge-secret';

  it('round-trips and rejects tampering, kind mismatch and expiry', async () => {
    const signed = await signChallenge(secret, 'abc', 'registration', 1_000);
    expect(await verifyChallenge(secret, signed, 'registration', 2_000)).toBe('abc');
    expect(await verifyChallenge(secret, signed, 'authentication', 2_000)).toBeNull();
    expect(await verifyChallenge(secret, signed, 'registration', 1_000 + challengeTtlMs + 1)).toBeNull();
    expect(await verifyChallenge(secret, `${signed}x`, 'registration', 2_000)).toBeNull();
    expect(await verifyChallenge('other', signed, 'registration', 2_000)).toBeNull();
    expect(await verifyChallenge(secret, undefined, 'registration', 2_000)).toBeNull();
  });

  it('encodes binary public keys as base64url', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = bytesToBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect([...(base64UrlToBytes(encoded) ?? [])]).toEqual([...bytes]);
  });
});

describe('passkey enrolment and sign-in', () => {
  it('walks through enrolment, sign-in, and removal', async () => {
    // No passkeys: the login page shows the password form and sign-in options are unavailable.
    const before = await (await call('/login')).text();
    expect(before).toContain('name="password"');
    expect(before).not.toContain('passkey-login');
    const none = await call('/auth/passkey/options', { method: 'POST', headers: { Origin: origin } });
    expect(none.status).toBe(404);

    // Enrolment needs a session and a same-origin request.
    const anonymous = await call('/security/passkeys/options', { method: 'POST', headers: { Origin: origin, Accept: 'application/json' } });
    expect(anonymous.status).toBe(401);
    const { cookie: session } = await login();
    const crossSite = await call('/security/passkeys/options', { method: 'POST', headers: { Cookie: session, Origin: 'https://evil.test' } });
    expect(crossSite.status).toBe(403);

    const options = await callJson<{ challenge: string; rp: { id: string }; user: { name: string }; excludeCredentials: unknown[] }>(
      '/security/passkeys/options',
      { method: 'POST', headers: { Cookie: session, Origin: origin } },
    );
    expect(options.status).toBe(200);
    expect(options.body.rp.id).toBe('feedback.test');
    expect(options.body.excludeCredentials).toEqual([]);
    const registrationChallenge = cookieOf(options.response, 'fb_challenge');
    expect(registrationChallenge).toMatch(/^fb_challenge=.+\..+/);

    let seenRegistration: Record<string, unknown> | null = null;
    verifiers.verifyRegistrationResponse = (async (input: Record<string, unknown>) => {
      seenRegistration = input;
      const response = input.response as { id: string };
      return {
        verified: true,
        registrationInfo: {
          credential: { id: response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal', 'hybrid'] },
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
        },
      };
    }) as unknown as typeof verifiers.verifyRegistrationResponse;

    const created = await callJson<{ ok: boolean; passkey: { id: string; name: string; backed_up: boolean } }>('/security/passkeys', {
      method: 'POST',
      headers: { Cookie: `${session}; ${registrationChallenge}`, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ' iPhone ', response: { id: 'cred-one', rawId: 'cred-one', type: 'public-key', response: {} } }),
    });
    expect(created.status).toBe(201);
    expect(created.body.passkey).toMatchObject({ id: 'cred-one', name: 'iPhone', backed_up: true });
    expect(seenRegistration).toMatchObject({ expectedChallenge: options.body.challenge, expectedOrigin: origin, expectedRPID: 'feedback.test' });

    // The challenge cookie is stateless: the same browser may reuse it until it expires (5 minutes).
    const replay = await call('/security/passkeys', {
      method: 'POST',
      headers: { Cookie: `${session}; ${registrationChallenge}`, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'again', response: { id: 'cred-two' } }),
    });
    expect(replay.status).toBe(201);
    expect((await listPasskeys(env.DB)).map((row) => row.id)).toEqual(['cred-one', 'cred-two']);

    const security = await (await call('/security', { headers: { Cookie: session } })).text();
    expect(security).toContain('iPhone');
    expect(security).toContain('Synced passkey');

    // Login page now offers the passkey, with the password behind a link.
    const after = await (await call('/login')).text();
    expect(after).toContain('passkey-login');
    expect(after).not.toContain('name="password"');
    expect(await (await call('/login?password=1')).text()).toContain('name="password"');

    const authOptions = await callJson<{ challenge: string; allowCredentials: Array<{ id: string }> }>('/auth/passkey/options', {
      method: 'POST',
      headers: { Origin: origin },
    });
    expect(authOptions.status).toBe(200);
    expect(authOptions.body.allowCredentials.map((item) => item.id)).toEqual(['cred-one', 'cred-two']);
    const authChallenge = cookieOf(authOptions.response, 'fb_challenge');

    // Unknown credential, missing challenge, and a rejected assertion all fail without a session.
    const unknown = await call('/auth/passkey/verify', {
      method: 'POST',
      headers: { Cookie: authChallenge, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'nope', response: {} }),
    });
    expect(unknown.status).toBe(401);
    const noChallenge = await call('/auth/passkey/verify', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'cred-one', response: {} }),
    });
    expect(noChallenge.status).toBe(400);

    let seenAuthentication: Record<string, unknown> | null = null;
    verifiers.verifyAuthenticationResponse = (async (input: Record<string, unknown>) => {
      seenAuthentication = input;
      return { verified: false, authenticationInfo: { newCounter: 0 } };
    }) as unknown as typeof verifiers.verifyAuthenticationResponse;
    const rejected = await call('/auth/passkey/verify', {
      method: 'POST',
      headers: { Cookie: authChallenge, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'cred-one', response: {} }),
    });
    expect(rejected.status).toBe(401);
    expect(rejected.headers.get('Set-Cookie') ?? '').not.toContain('fb_session=');

    verifiers.verifyAuthenticationResponse = (async (input: Record<string, unknown>) => {
      seenAuthentication = input;
      return { verified: true, authenticationInfo: { newCounter: 7 } };
    }) as unknown as typeof verifiers.verifyAuthenticationResponse;
    const accepted = await callJson<{ ok: boolean; redirect: string }>('/auth/passkey/verify', {
      method: 'POST',
      headers: { Cookie: authChallenge, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'cred-one', response: {} }),
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ ok: true, redirect: '/' });
    const sessionCookie = cookieOf(accepted.response, 'fb_session');
    expect(sessionCookie).toMatch(/^fb_session=.+/);
    expect(seenAuthentication).toMatchObject({ expectedChallenge: authOptions.body.challenge, expectedOrigin: origin });
    const credential = (seenAuthentication as unknown as { credential: { publicKey: Uint8Array; counter: number } }).credential;
    expect([...credential.publicKey]).toEqual([1, 2, 3]);
    expect((await listPasskeys(env.DB)).find((row) => row.id === 'cred-one')).toMatchObject({ counter: 7 });
    expect((await listPasskeys(env.DB)).find((row) => row.id === 'cred-one')?.last_used_at).toBeTruthy();

    // The passkey session works for the dashboard and can remove passkeys.
    expect((await call('/', { headers: { Cookie: sessionCookie } })).status).toBe(200);
    for (const id of ['cred-one', 'cred-two']) {
      const removed = await call(`/security/passkeys/${id}/delete`, { method: 'POST', headers: { Cookie: sessionCookie } });
      expect(removed.status).toBe(303);
    }
    expect(await listPasskeys(env.DB)).toEqual([]);
    expect(await (await call('/login')).text()).toContain('name="password"');
  });
});
