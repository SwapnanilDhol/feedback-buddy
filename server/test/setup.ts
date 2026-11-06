import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

// Keep tests hermetic: any outbound fetch a test did not stub itself fails fast
// (icon lookups fall back to "checked, no icon"; destination tests stub their own).
import { vi } from 'vitest';
const realFetch = globalThis.fetch;
const hermeticFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new Request(input, init).url;
  if (url.startsWith('https://feedback.test') || url.startsWith('http://localhost')) return realFetch(input, init);
  return new Response('blocked in tests', { status: 599 });
}) as typeof fetch;
vi.stubGlobal('fetch', hermeticFetch);
