import { enforceRetention } from './attachments';
import { retryDueDeliveries } from './delivery';
import { refreshProjectIcons } from './icons';
import { errorMessage, writeLog } from './log';
import { deleteExpiredSessions } from './repository';

// The Workers Free plan caps cron triggers per account, so maintenance
// (delivery retries, attachment retention, session cleanup) piggybacks on
// traffic: at most once per minute per isolate, after the response is sent.
export const maintenanceIntervalMs = 60_000;
let lastMaintenanceAt = 0;

export function shouldRunMaintenance(now: number, last = lastMaintenanceAt): boolean {
  return now - last >= maintenanceIntervalMs;
}

export function markMaintenanceRun(now: number): void {
  lastMaintenanceAt = now;
}

/** Runs delivery retries, attachment retention and session cleanup. */
export async function runMaintenance(env: Env): Promise<void> {
  const baseUrl = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') || 'https://feedback-buddy.invalid';
  try {
    const retried = await retryDueDeliveries(env, baseUrl);
    const removed = await enforceRetention(env);
    await deleteExpiredSessions(env.DB);
    const icons = await refreshProjectIcons(env);
    writeLog('maintenance.completed', 'info', { delivered: retried.delivered, failed: retried.failed, attachments_removed: removed, icons_updated: icons });
  } catch (error) {
    writeLog('maintenance.failed', 'error', { error: errorMessage(error) });
  }
}
