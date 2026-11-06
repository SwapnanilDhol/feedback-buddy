import { capabilityUrl } from './attachments';
import { errorMessage, writeLog } from './log';
import {
  listDueDeliveries,
  markDeliveryDelivered,
  markDeliveryFailed,
  readDestinationById,
  readFeedback,
  readProject,
  toFeedback,
  type DeliveryRow,
  type DestinationRow,
  type Feedback,
  type FeedbackRow,
  type Project,
} from './repository';
import type { Category } from './schema';
import { hmacSha256Hex } from './security';

/** Minutes before the next attempt, indexed by the number of attempts so far. */
export const backoffMinutes = [1, 5, 15, 60, 240, 360, 360] as const;
export const maximumAttempts = 8;
const requestTimeoutMs = 5_000;

export function nextAttemptAt(attemptsSoFar: number, now = Date.now()): string | null {
  if (attemptsSoFar >= maximumAttempts) return null;
  const minutes = backoffMinutes[Math.min(attemptsSoFar - 1, backoffMinutes.length - 1)] ?? 360;
  return new Date(now + minutes * 60_000).toISOString();
}

export function destinationAccepts(destination: Pick<DestinationRow, 'enabled' | 'categories_json'>, category: Category): boolean {
  if (!destination.enabled) return false;
  let categories: unknown;
  try {
    categories = JSON.parse(destination.categories_json);
  } catch {
    categories = [];
  }
  return !Array.isArray(categories) || categories.length === 0 || categories.includes(category);
}

export interface WebhookEvent {
  schema_version: 1;
  id: string;
  type: 'feedback.created';
  occurred_at: string;
  project: { id: string; slug: string; name: string };
  data: Feedback;
}

export function buildWebhookEvent(project: Project, feedback: Feedback, eventId: string, occurredAt: string): WebhookEvent {
  return {
    schema_version: 1,
    id: eventId,
    type: 'feedback.created',
    occurred_at: occurredAt,
    project: { id: project.id, slug: project.slug, name: project.name },
    data: feedback,
  };
}

const categoryLabel: Record<Category, { emoji: string; label: string }> = {
  feedback: { emoji: ':speech_balloon:', label: 'Feedback' },
  bug: { emoji: ':lady_beetle:', label: 'Bug' },
  idea: { emoji: ':bulb:', label: 'Idea' },
};

function mrkdwn(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildSlackPayload(project: Project, feedback: Feedback): { text: string; blocks: unknown[] } {
  const { emoji, label } = categoryLabel[feedback.category];
  const context = feedback.context;
  const summaryParts = [
    `v${context.app_version} (${context.build_number})`,
    `${context.device_family}${context.device_model ? ` ${context.device_model}` : ''} · ${context.os_version}`,
    context.locale,
  ];
  if (feedback.user.account_status !== 'unknown') {
    summaryParts.push(feedback.user.plan ? `${feedback.user.account_status} · ${feedback.user.plan}` : feedback.user.account_status);
  }
  const blocks: unknown[] = [
    { type: 'header', text: { type: 'plain_text', text: `${label} · ${project.name}`.slice(0, 150), emoji: true } },
    { type: 'section', text: { type: 'mrkdwn', text: `${emoji} ${mrkdwn(feedback.message).slice(0, 2900)}` } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: mrkdwn(summaryParts.join(' · ')) }] },
  ];
  const contactFields: unknown[] = [];
  if (feedback.name) contactFields.push({ type: 'mrkdwn', text: `*Name*\n${mrkdwn(feedback.name)}` });
  if (feedback.reply_email) contactFields.push({ type: 'mrkdwn', text: `*Email*\n${mrkdwn(feedback.reply_email)}` });
  if (contactFields.length > 0) blocks.push({ type: 'section', fields: contactFields });
  if (feedback.attachment) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `<${feedback.attachment.url}|View attachment>` } });
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Reference ${feedback.id.slice(0, 8).toUpperCase()}` }] });
  return { text: `${label} for ${project.name}: ${feedback.message.slice(0, 200)}`, blocks };
}

export interface DeliveryTarget {
  project: Project;
  feedback: Feedback;
  destination: DestinationRow;
  deliveryId: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/** Plain, readable notification: subject with app and category, the message first, then context. */
export function buildEmail(project: Project, feedback: Feedback, baseUrl: string): RenderedEmail {
  const reference = feedback.id.slice(0, 8).toUpperCase();
  const category = feedback.category[0]!.toUpperCase() + feedback.category.slice(1);
  const firstLine = feedback.message.replace(/\s+/g, ' ').trim().slice(0, 70);
  const link = `${baseUrl}/p/${project.id}/f/${feedback.id}`;
  const facts: Array<[string, string]> = [
    ['App', project.name],
    ['Version', `${feedback.context.app_version} (${feedback.context.build_number})`],
    ['Device', `${feedback.context.device_family}${feedback.context.device_model ? ` · ${feedback.context.device_model}` : ''} · ${feedback.context.os_version}`],
    ['Locale', feedback.context.locale],
    ['From', [feedback.name, feedback.reply_email].filter(Boolean).join(' · ') || 'anonymous'],
    ['Account', `${feedback.user.account_status}${feedback.user.plan ? ` · ${feedback.user.plan}` : ''}`],
  ];
  const text = [
    `${category} · ${reference} · ${project.name}`,
    '',
    feedback.message,
    '',
    ...facts.map(([key, value]) => `${key}: ${value}`),
    ...(feedback.attachment ? ['', `Image: ${feedback.attachment.url}`] : []),
    '',
    `Open: ${link}`,
    ...(feedback.reply_email ? [`Reply: mailto:${feedback.reply_email}?subject=${encodeURIComponent(`Re: your ${project.name} feedback ${reference}`)}`] : []),
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#fafafa;font:15px/1.5 -apple-system,BlinkMacSystemFont,Inter,system-ui,sans-serif;color:#121212">
<div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e7e7e7;border-radius:12px;padding:20px 24px">
<p style="margin:0 0 4px;font-size:12px;color:#7a7a7a;text-transform:uppercase;letter-spacing:.4px">${escapeHtml(project.name)} · ${escapeHtml(category)} · ${reference}</p>
<p style="margin:0 0 18px;font-size:17px;white-space:pre-wrap">${escapeHtml(feedback.message)}</p>
${feedback.attachment ? `<p style="margin:0 0 18px"><a href="${escapeHtml(feedback.attachment.url)}"><img src="${escapeHtml(feedback.attachment.url)}" alt="Attached image" style="max-width:100%;border-radius:8px;border:1px solid #e7e7e7"></a></p>` : ''}
<table style="border-collapse:collapse;font-size:13px;color:#4a4a4a">${facts.map(([key, value]) => `<tr><td style="padding:3px 14px 3px 0;color:#7a7a7a">${escapeHtml(key)}</td><td style="padding:3px 0">${escapeHtml(value)}</td></tr>`).join('')}</table>
<p style="margin:20px 0 0"><a href="${escapeHtml(link)}" style="display:inline-block;background:#121212;color:#fff;text-decoration:none;font-weight:600;font-size:13px;padding:9px 14px;border-radius:7px">Open in FeedbackBuddy</a>${feedback.reply_email ? ` &nbsp; <a href="mailto:${escapeHtml(feedback.reply_email)}?subject=${encodeURIComponent(`Re: your ${project.name} feedback ${reference}`)}" style="color:#1f5eff;font-size:13px">Reply to ${escapeHtml(feedback.reply_email)}</a>` : ''}</p>
</div></body></html>`;
  return { subject: `[${project.name}] ${category}: ${firstLine}${feedback.message.length > 70 ? '…' : ''}`, text, html };
}

export interface Mailer {
  send(message: { to: string; from: { email: string; name: string }; replyTo?: string; subject: string; text: string; html: string }): Promise<void>;
}

export async function sendEmailNotification(target: DeliveryTarget, mailer: Mailer | undefined, from: string | undefined, baseUrl: string): Promise<void> {
  if (!mailer || !from) throw new Error('email_not_configured');
  const rendered = buildEmail(target.project, target.feedback, baseUrl);
  try {
    await mailer.send({
      to: target.destination.url,
      from: { email: from, name: `FeedbackBuddy · ${target.project.name}` },
      ...(target.feedback.reply_email ? { replyTo: target.feedback.reply_email } : {}),
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  } catch (error) {
    throw new Error(`email_send_failed:${(error instanceof Error ? error.message : 'unknown').slice(0, 120)}`);
  }
}

/** Performs one HTTP attempt. Throws with a short error code on failure. */
export async function sendToDestination(target: DeliveryTarget, fetcher: typeof fetch = fetch): Promise<void> {
  const { destination, project, feedback, deliveryId } = target;
  let body: string;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (destination.kind === 'slack_webhook') {
    body = JSON.stringify(buildSlackPayload(project, feedback));
  } else {
    const event = buildWebhookEvent(project, feedback, deliveryId, new Date().toISOString());
    body = JSON.stringify(event);
    headers['X-Feedback-Event'] = event.type;
    headers['X-Feedback-Delivery'] = deliveryId;
    if (destination.secret) {
      headers['X-Feedback-Signature'] = `sha256=${await hmacSha256Hex(destination.secret, body)}`;
    }
  }
  let response: Response;
  try {
    response = await fetcher(destination.url, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(requestTimeoutMs),
      redirect: 'manual',
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === 'TimeoutError' ? 'destination_timeout' : 'destination_unreachable');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`destination_http_${response.status}`);
  }
  await response.body?.cancel();
}

async function loadTarget(env: Env, baseUrl: string, delivery: DeliveryRow): Promise<DeliveryTarget | null> {
  const row = await readFeedback(env.DB, delivery.feedback_id);
  const destination = await readDestinationById(env.DB, delivery.destination_id);
  if (!row || !destination) return null;
  const project = await readProject(env.DB, row.project_id);
  if (!project) return null;
  return {
    project,
    feedback: toFeedback(row, (feedbackRow: FeedbackRow) => capabilityUrl(baseUrl, feedbackRow)),
    destination,
    deliveryId: delivery.id,
  };
}

async function attempt(env: Env, baseUrl: string, delivery: DeliveryRow): Promise<boolean> {
  const attempts = delivery.attempts + 1;
  try {
    const target = await loadTarget(env, baseUrl, delivery);
    if (!target) {
      await markDeliveryFailed(env.DB, delivery.id, attempts, 'destination_missing', null);
      return false;
    }
    if (!target.destination.enabled) {
      await markDeliveryFailed(env.DB, delivery.id, attempts, 'destination_disabled', null);
      return false;
    }
    if (target.destination.kind === 'email') {
      await sendEmailNotification(target, env.EMAIL as Mailer | undefined, env.EMAIL_FROM, baseUrl);
    } else {
      await sendToDestination(target);
    }
    await markDeliveryDelivered(env.DB, delivery.id, attempts);
    return true;
  } catch (error) {
    const reason = errorMessage(error);
    await markDeliveryFailed(env.DB, delivery.id, attempts, reason, nextAttemptAt(attempts));
    writeLog('delivery.failed', 'warn', { delivery_id: delivery.id, attempts, error: reason });
    return false;
  }
}

/** Delivers everything due for one feedback record (called from waitUntil after ingest). */
export async function deliverFeedback(env: Env, baseUrl: string, feedbackId: string): Promise<{ delivered: number; failed: number }> {
  const due = await listDueDeliveries(env.DB, feedbackId, 20);
  let delivered = 0;
  let failed = 0;
  for (const delivery of due) {
    if (await attempt(env, baseUrl, delivery)) delivered += 1;
    else failed += 1;
  }
  return { delivered, failed };
}

/** Cron entry point: retries every failed delivery whose backoff has elapsed. */
export async function retryDueDeliveries(env: Env, baseUrl: string, limit = 50): Promise<{ delivered: number; failed: number }> {
  const due = await listDueDeliveries(env.DB, null, limit);
  let delivered = 0;
  let failed = 0;
  for (const delivery of due) {
    if (await attempt(env, baseUrl, delivery)) delivered += 1;
    else failed += 1;
  }
  return { delivered, failed };
}

/** Summarises delivery rows into the receipt's delivery_status. */
export function summarizeDeliveryStatus(rows: Array<Pick<DeliveryRow, 'status'>>): 'accepted' | 'delivered' | 'failed' {
  if (rows.length === 0) return 'accepted';
  if (rows.every((row) => row.status === 'delivered')) return 'delivered';
  if (rows.some((row) => row.status === 'failed' || row.status === 'exhausted')) return 'failed';
  return 'accepted';
}

export function sampleFeedback(project: Project): Feedback {
  const now = new Date().toISOString();
  return {
    id: '00000000-0000-4000-8000-000000000000',
    key: `${project.key}-0`,
    number: 0,
    project_id: project.id,
    category: 'feedback',
    status: 'todo',
    message: 'This is a test delivery from FeedbackBuddy. Your destination is connected.',
    name: 'FeedbackBuddy',
    reply_email: null,
    context: { app_version: '1.0', build_number: '1', os_version: '26.0', locale: 'en-US', device_family: 'iPhone', device_model: null },
    user: { id: null, account_status: 'unknown', plan: null, entitlements: [], attributes: {} },
    attachment: null,
    internal_note: null,
    created_at: now,
    updated_at: now,
  };
}
