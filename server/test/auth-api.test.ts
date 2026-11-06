import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import { listPasskeys, verifiers } from '../src/passkeys';
import { adminHeaders, call, callJson } from './helpers';

const originalVerifiers = { ...verifiers };
afterEach(() => {
  verifiers.verifyRegistrationResponse = originalVerifiers.verifyRegistrationResponse;
  verifiers.verifyAuthenticationResponse = originalVerifiers.verifyAuthenticationResponse;
});

const json = (body: unknown) => ({ method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const party = { rp_id: 'dash.example.test', origin: 'https://dash.example.test' };

describe('operator auth API for external dashboards', () => {
  it('checks the password behind the admin token', async () => {
    expect((await call('/api/v1/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"password":"test-password"}' })).status).toBe(401);
    expect((await callJson('/api/v1/auth/password', json({ password: 'nope' }))).status).toBe(401);
    expect((await callJson<{ ok: boolean }>('/api/v1/auth/password', json({ password: 'test-password' }))).body.ok).toBe(true);
  });

  it('only runs ceremonies for allow-listed relying parties', async () => {
    expect((await callJson('/api/v1/auth/passkeys/registration-options', json({ rp_id: 'evil.test', origin: 'https://evil.test' }))).status).toBe(403);
    expect((await callJson('/api/v1/auth/passkeys/registration-options', json({ rp_id: 'dash.example.test', origin: 'https://other.test' }))).status).toBe(422);
    expect((await callJson('/api/v1/auth/passkeys/registration-options', json({ rp_id: 'localhost', origin: 'http://localhost:3000' }))).status).toBe(200);
    expect((await callJson('/api/v1/auth/passkeys/registration-options', json({ rp_id: 'feedback.test', origin: 'https://feedback.test' }))).status).toBe(200);
  });

  it('registers, authenticates and removes passkeys for a dashboard host', async () => {
    const options = await callJson<{ challenge: string; rp: { id: string } }>('/api/v1/auth/passkeys/registration-options', json(party));
    expect(options.status).toBe(200);
    expect(options.body.rp.id).toBe('dash.example.test');

    let seen: Record<string, unknown> | null = null;
    verifiers.verifyRegistrationResponse = (async (input: Record<string, unknown>) => {
      seen = input;
      return { verified: true, registrationInfo: { credential: { id: 'dash-cred', publicKey: new Uint8Array([9, 9]), counter: 0, transports: ['internal'] }, credentialDeviceType: 'multiDevice', credentialBackedUp: true } };
    }) as unknown as typeof verifiers.verifyRegistrationResponse;
    const created = await callJson<{ passkey: { id: string; name: string } }>('/api/v1/auth/passkeys', json({ ...party, challenge: options.body.challenge, name: 'MacBook', response: { id: 'dash-cred', response: {} } }));
    expect(created.status).toBe(201);
    expect(created.body.passkey).toMatchObject({ id: 'dash-cred', name: 'MacBook' });
    expect(seen).toMatchObject({ expectedChallenge: options.body.challenge, expectedOrigin: 'https://dash.example.test', expectedRPID: 'dash.example.test' });

    const listed = await callJson<{ passkeys: Array<{ id: string }> }>('/api/v1/auth/passkeys', { headers: adminHeaders });
    expect(listed.body.passkeys.map((item) => item.id)).toContain('dash-cred');

    const authOptions = await callJson<{ challenge: string; allowCredentials: Array<{ id: string }> }>('/api/v1/auth/passkeys/authentication-options', json(party));
    expect(authOptions.status).toBe(200);
    expect(authOptions.body.allowCredentials.map((item) => item.id)).toContain('dash-cred');

    verifiers.verifyAuthenticationResponse = (async () => ({ verified: false, authenticationInfo: { newCounter: 0 } })) as unknown as typeof verifiers.verifyAuthenticationResponse;
    expect((await callJson('/api/v1/auth/passkeys/authenticate', json({ ...party, challenge: authOptions.body.challenge, response: { id: 'dash-cred', response: {} } }))).status).toBe(401);
    verifiers.verifyAuthenticationResponse = (async () => ({ verified: true, authenticationInfo: { newCounter: 3 } })) as unknown as typeof verifiers.verifyAuthenticationResponse;
    const ok = await callJson<{ ok: boolean; passkey: { name: string } }>('/api/v1/auth/passkeys/authenticate', json({ ...party, challenge: authOptions.body.challenge, response: { id: 'dash-cred', response: {} } }));
    expect(ok.status).toBe(200);
    expect(ok.body.passkey.name).toBe('MacBook');
    expect((await listPasskeys(env.DB)).find((row) => row.id === 'dash-cred')?.counter).toBe(3);

    expect((await callJson('/api/v1/auth/passkeys/dash-cred', { method: 'DELETE', headers: adminHeaders })).status).toBe(200);
    expect((await callJson('/api/v1/auth/passkeys/dash-cred', { method: 'DELETE', headers: adminHeaders })).status).toBe(404);
    expect((await callJson('/api/v1/auth/passkeys/authentication-options', json(party))).status).toBe(404);
  });
});
