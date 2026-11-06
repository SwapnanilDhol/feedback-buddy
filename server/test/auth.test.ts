import { describe, expect, it } from 'vitest';

import { signSessionId, verifySessionCookie } from '../src/auth';
import { call, login } from './helpers';

describe('session cookies', () => {
  it('round-trips a signed session id and rejects tampering', async () => {
    const id = crypto.randomUUID();
    const cookie = await signSessionId(id, 'secret-a');
    expect(await verifySessionCookie(cookie, 'secret-a')).toBe(id);
    expect(await verifySessionCookie(cookie, 'secret-b')).toBeNull();
    expect(await verifySessionCookie(`${cookie}x`, 'secret-a')).toBeNull();
    const flipped = (cookie.startsWith('Z') ? 'A' : 'Z') + cookie.slice(1);
    expect(await verifySessionCookie(flipped, 'secret-a')).toBeNull();
    expect(await verifySessionCookie('garbage', 'secret-a')).toBeNull();
    expect(await verifySessionCookie(undefined, 'secret-a')).toBeNull();
  });

  it('rejects a session that is signed but expired in the database', async () => {
    const { cookie } = await login();
    const id = await verifySessionCookie(cookie.split('=')[1] ?? '', 'test-session-secret-0123456789abcdef0123456789');
    expect(id).not.toBeNull();
    const { env } = await import('cloudflare:test');
    await env.DB.prepare('UPDATE sessions SET expires_at = ?2 WHERE id = ?1').bind(id, '2000-01-01T00:00:00.000Z').run();
    const response = await call('/', { headers: { Cookie: cookie } });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/login');
  });
});
