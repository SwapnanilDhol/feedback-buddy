import { writeLog } from './log';
import { listProjectsNeedingIcon, markIconLookupFailed, updateProjectIcon, type Project } from './repository';

export const iconThrottleBackoffMs = 6 * 60 * 60 * 1000;

/**
 * App icons come from Apple's public iTunes Search API, keyed by bundle ID.
 * Results are cached on the project row and rechecked weekly by maintenance.
 */
export async function lookupAppIcon(bundleId: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}&entity=software`;
  const response = await fetcher(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'feedback-buddy/1.0 (+https://github.com/SwapnanilDhol/feedback-buddy)' },
    signal: AbortSignal.timeout(6_000),
  });
  if (!response.ok) throw new Error(`itunes_http_${response.status}`);
  const text = await response.text();
  if (text.length > 512 * 1024) throw new Error('itunes_response_too_large');
  const body = JSON.parse(text) as { results?: Array<Record<string, unknown>> };
  const first = body.results?.[0];
  const artwork = [first?.artworkUrl512, first?.artworkUrl100, first?.artworkUrl60].find((value): value is string => typeof value === 'string');
  if (!artwork) return null;
  return normaliseArtworkUrl(artwork);
}

/** Request a 256px square from Apple's image CDN regardless of the size the API returned. */
export function normaliseArtworkUrl(url: string): string {
  return url.replace(/\/\d+x\d+(bb)?(-\d+)?\.(png|jpg|jpeg|webp)$/i, '/256x256bb.png');
}

/**
 * Looks up a few due projects per call. Apple rate-limits the lookup API per
 * client address, and Workers share egress addresses, so bursts fail: three
 * per maintenance pass (at most once a minute) stays comfortably under it.
 */
export async function refreshProjectIcons(env: Env, fetcher: typeof fetch = fetch, now = Date.now()): Promise<number> {
  const projects = await listProjectsNeedingIcon(env.DB, now);
  let updated = 0;
  for (const project of projects) {
    updated += (await refreshProjectIcon(env, project, fetcher, now)) ? 1 : 0;
  }
  return updated;
}

export async function refreshProjectIcon(env: Env, project: Project, fetcher: typeof fetch = fetch, now = Date.now()): Promise<boolean> {
  if (!project.bundle_id) return false;
  try {
    const icon = await lookupAppIcon(project.bundle_id, fetcher);
    // No result is a real answer (not on the App Store): recheck weekly.
    await updateProjectIcon(env.DB, project.id, icon, now);
    return icon !== null && icon !== project.icon_url;
  } catch (error) {
    // Network errors are retried in minutes. A 403/429 means Apple is throttling
    // this egress address, so back off for hours instead of hammering it.
    const message = error instanceof Error ? error.message : 'unknown';
    const throttled = message === 'itunes_http_403' || message === 'itunes_http_429';
    await markIconLookupFailed(env.DB, project.id, now, throttled ? iconThrottleBackoffMs : undefined);
    writeLog('icon.lookup_failed', 'warn', { project_id: project.id, error: message });
    return false;
  }
}
