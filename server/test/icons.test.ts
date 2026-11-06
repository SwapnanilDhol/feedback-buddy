import { env } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import { lookupAppIcon, normaliseArtworkUrl, refreshProjectIcons } from '../src/icons';
import { iconRetryMs, listProjects, readProject } from '../src/repository';
import { callJson, adminHeaders } from './helpers';

const artwork = 'https://is1-ssl.mzstatic.com/image/thumb/Purple/v4/ab/cd/ef/icon/100x100bb.jpg';

function stubFetch(handler: (url: string) => Response): typeof fetch {
  return (async (input: RequestInfo | URL) => handler(new Request(input).url)) as typeof fetch;
}

describe('app icons', () => {
  it('normalises artwork URLs to a 256px square', () => {
    expect(normaliseArtworkUrl(artwork)).toBe('https://is1-ssl.mzstatic.com/image/thumb/Purple/v4/ab/cd/ef/icon/256x256bb.png');
    expect(normaliseArtworkUrl('https://x.test/a/512x512bb.png')).toBe('https://x.test/a/256x256bb.png');
    expect(normaliseArtworkUrl('https://x.test/a/other.png')).toBe('https://x.test/a/other.png');
  });

  it('looks up the icon by bundle id and tolerates missing results', async () => {
    const found = await lookupAppIcon('com.example.app', stubFetch((url) => {
      expect(url).toContain('bundleId=com.example.app');
      return Response.json({ resultCount: 1, results: [{ artworkUrl100: artwork }] });
    }));
    expect(found).toBe('https://is1-ssl.mzstatic.com/image/thumb/Purple/v4/ab/cd/ef/icon/256x256bb.png');
    expect(await lookupAppIcon('com.example.none', stubFetch(() => Response.json({ resultCount: 0, results: [] })))).toBeNull();
    await expect(lookupAppIcon('com.example.err', stubFetch(() => new Response('nope', { status: 503 })))).rejects.toThrow('itunes_http_503');
  });

  it('caches icons on projects and marks failures as checked', async () => {
    const handler = stubFetch((url) =>
      url.includes('com.example.icon') ? Response.json({ results: [{ artworkUrl512: 'https://x.test/i/512x512bb.png' }] }) : new Response('', { status: 500 }),
    );
    vi.stubGlobal('fetch', handler);
    try {
      const withIcon = await callJson<{ project: { id: string } }>('/api/v1/projects', {
        method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Icon App', bundle_id: 'com.example.icon' }),
      });
      const failing = await callJson<{ project: { id: string } }>('/api/v1/projects', {
        method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Broken App', bundle_id: 'com.example.broken' }),
      });
      // Request-driven maintenance may already have looked some of these up; the explicit pass finishes the rest.
      await refreshProjectIcons(env, handler);
      expect((await readProject(env.DB, withIcon.body.project.id))?.icon_url).toBe('https://x.test/i/256x256bb.png');
      expect((await readProject(env.DB, failing.body.project.id))?.icon_url).toBeNull();
      // Both are now "checked", so an immediate second pass makes no lookups.
      expect(await refreshProjectIcons(env, stubFetch(() => { throw new Error('should not be called'); }))).toBe(0);
      // The failed one is retried after the retry window, and succeeds this time; the good one is not touched.
      let calls = 0;
      const later = Date.now() + iconRetryMs + 1_000;
      const retried = await refreshProjectIcons(env, stubFetch((url) => { calls += 1; expect(url).toContain('com.example.broken'); return Response.json({ results: [{ artworkUrl100: 'https://x.test/b/100x100bb.png' }] }); }), later);
      expect(retried).toBe(1);
      expect(calls).toBe(1);
      expect((await readProject(env.DB, failing.body.project.id))?.icon_url).toBe('https://x.test/b/256x256bb.png');
      const listed = await listProjects(env.DB);
      expect(listed.find((project) => project.id === withIcon.body.project.id)?.icon_url).toContain('256x256bb.png');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
