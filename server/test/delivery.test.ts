import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import webhookFixtureJson from '../../contracts/fixtures/webhook-event-v1.json';
import { backoffMinutes, buildSlackPayload, buildWebhookEvent, maximumAttempts, nextAttemptAt, retryDueDeliveries, sampleFeedback } from '../src/delivery';
import { hmacSha256Hex } from '../src/security';
import { adminHeaders, call, callJson, createProject, mockOutbound, submit, validSubmission } from './helpers';

const webhookFixture = webhookFixtureJson as Record<string, unknown>;

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) return 'array';
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, shapeOf(item)]));
  }
  return value === null ? 'null' : typeof value;
}

const sampleProject = { id: 'prj_x', slug: 'x', name: 'X App', bundle_id: null, accent: null, retention_days: 30, icon_url: null, created_at: '', updated_at: '' };

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

describe('backoff schedule', () => {
  it('follows 1, 5, 15, 60, 240 minutes then 6 hours and stops after eight attempts', () => {
    const start = Date.parse('2026-01-01T00:00:00.000Z');
    [1, 5, 15, 60, 240, 360, 360].forEach((minutes, index) => {
      expect(nextAttemptAt(index + 1, start)).toBe(new Date(start + minutes * 60_000).toISOString());
    });
    expect(backoffMinutes).toHaveLength(7);
    expect(nextAttemptAt(maximumAttempts, start)).toBeNull();
    expect(nextAttemptAt(maximumAttempts + 1, start)).toBeNull();
  });
});

describe('webhook delivery', () => {
  it('posts a signed event whose body shape matches the contract fixture', async () => {
    const project = await createProject('Hooked App');
    const secret = 'webhook-secret-123';
    await callJson(`/api/v1/projects/${project.id}/destinations`, jsonInit('POST', { kind: 'webhook', url: 'https://hooks.example.com/feedback', secret }));
    const outbound = mockOutbound([() => new Response('ok', { status: 200 })]);
    restore = outbound.restore;

    const { body } = await submit(project.public_key);
    expect(outbound.requests).toHaveLength(1);
    const request = outbound.requests[0]!;
    expect(request.url).toBe('https://hooks.example.com/feedback');
    expect(request.method).toBe('POST');
    const event = JSON.parse(request.body) as Record<string, unknown>;
    expect(event.type).toBe('feedback.created');
    expect(event.schema_version).toBe(1);
    expect((event.project as Record<string, unknown>).name).toBe('Hooked App');
    const data = event.data as Record<string, unknown>;
    expect(data.id).toBe(body.feedback_id);
    expect(data.reply_email).toBeNull();
    expect(data.message).toBe(validSubmission.message);
    const fixtureShape = shapeOf({ ...webhookFixture, data: { ...(webhookFixture.data as object), attachment: null } });
    expect(shapeOf(event)).toEqual(fixtureShape);

    expect(request.headers['content-type']).toBe('application/json');
    expect(request.headers['x-feedback-event']).toBe('feedback.created');
    expect(request.headers['x-feedback-delivery']).toBe(event.id);
    expect(request.headers['x-feedback-signature']).toBe(`sha256=${await hmacSha256Hex(secret, request.body)}`);

    const detail = await callJson<{ deliveries: Array<{ status: string; attempts: number; destination_kind: string }> }>(`/api/v1/feedback/${body.feedback_id}`, { headers: adminHeaders });
    expect(detail.body.deliveries).toEqual([expect.objectContaining({ status: 'delivered', attempts: 1, destination_kind: 'webhook' })]);
  });

  it('includes a capability attachment URL in events', () => {
    const feedback = { ...sampleFeedback(sampleProject), attachment: { content_type: 'image/jpeg' as const, byte_count: 10, url: 'https://feedback.test/v1/attachments/abc' } };
    const event = buildWebhookEvent(sampleProject, feedback, crypto.randomUUID(), new Date().toISOString());
    expect(event.data.attachment?.url).toContain('/v1/attachments/');
  });

  it('skips destinations whose category filter does not match', async () => {
    const project = await createProject();
    await callJson(`/api/v1/projects/${project.id}/destinations`, jsonInit('POST', { kind: 'webhook', url: 'https://ideas.example.com/hook', secret: 'another-secret', categories: ['idea'] }));
    const outbound = mockOutbound([]);
    restore = outbound.restore;
    const { body } = await submit(project.public_key, { ...validSubmission, category: 'bug' });
    const detail = await callJson<{ deliveries: unknown[] }>(`/api/v1/feedback/${body.feedback_id}`, { headers: adminHeaders });
    expect(detail.body.deliveries).toHaveLength(0);
    expect(outbound.requests).toHaveLength(0);
  });

  it('schedules retries with backoff, exhausts after eight attempts, and can be redelivered', async () => {
    const project = await createProject();
    await callJson(`/api/v1/projects/${project.id}/destinations`, jsonInit('POST', { kind: 'slack_webhook', url: 'https://hooks.slack.com/services/T/B/X' }));
    const failures = Array.from({ length: maximumAttempts }, () => () => new Response('nope', { status: 500 }));
    const outbound = mockOutbound([...failures, () => new Response('ok', { status: 200 })]);
    restore = outbound.restore;

    const { body } = await submit(project.public_key);
    const read = async () =>
      env.DB.prepare('SELECT status, attempts, next_attempt_at, last_error FROM deliveries WHERE feedback_id = ?1')
        .bind(body.feedback_id)
        .first<{ status: string; attempts: number; next_attempt_at: string | null; last_error: string | null }>();
    let delivery = await read();
    expect(delivery).toMatchObject({ status: 'failed', attempts: 1, last_error: 'destination_http_500' });
    const firstDelay = Date.parse(delivery?.next_attempt_at ?? '') - Date.now();
    expect(firstDelay).toBeGreaterThan(30_000);
    expect(firstDelay).toBeLessThanOrEqual(60_000);

    // Not due yet: the cron pass leaves it alone.
    expect(await retryDueDeliveries(env, 'https://feedback.test')).toEqual({ delivered: 0, failed: 0 });

    for (let attempt = 2; attempt <= maximumAttempts; attempt += 1) {
      await env.DB.prepare("UPDATE deliveries SET next_attempt_at = '2000-01-01T00:00:00.000Z' WHERE feedback_id = ?1").bind(body.feedback_id).run();
      expect((await retryDueDeliveries(env, 'https://feedback.test')).failed).toBe(1);
      delivery = await read();
      expect(delivery?.attempts).toBe(attempt);
    }
    expect(delivery).toMatchObject({ status: 'exhausted', next_attempt_at: null });
    expect(await retryDueDeliveries(env, 'https://feedback.test')).toEqual({ delivered: 0, failed: 0 });
    expect(outbound.requests).toHaveLength(maximumAttempts);

    const redeliver = await callJson<{ ok: boolean; requeued: number }>(`/api/v1/feedback/${body.feedback_id}/redeliver`, { method: 'POST', headers: adminHeaders });
    expect(redeliver.status).toBe(202);
    expect(redeliver.body.requeued).toBe(1);
    delivery = await read();
    expect(delivery?.status).toBe('delivered');
    const slackBody = JSON.parse(outbound.requests[maximumAttempts]!.body) as Record<string, unknown>;
    expect(typeof slackBody.text).toBe('string');
    expect(Array.isArray(slackBody.blocks)).toBe(true);
  });

  it('builds a Slack Block Kit payload with escaped text and context', () => {
    const feedback = {
      ...sampleFeedback(sampleProject),
      message: 'Broken <b>bold</b> & more',
      name: 'Ana',
      reply_email: 'ana@example.com',
      user: { id: 'u1', account_status: 'paid' as const, plan: 'pro', entitlements: ['pro'], attributes: {} },
    };
    const payload = buildSlackPayload(sampleProject, feedback);
    const serialized = JSON.stringify(payload.blocks);
    expect(serialized).toContain('Broken &lt;b&gt;bold&lt;/b&gt; &amp; more');
    expect(serialized).toContain('paid · pro');
    expect(serialized).toContain('ana@example.com');
    expect(payload.text).toContain('X App');
  });

  it('reports test deliveries without creating feedback', async () => {
    const project = await createProject();
    const created = await callJson<{ destination: { id: string } }>(`/api/v1/projects/${project.id}/destinations`, jsonInit('POST', { kind: 'slack_webhook', url: 'https://hooks.slack.com/services/T/B/TEST' }));
    const outbound = mockOutbound([() => new Response('gone', { status: 404 }), () => new Response('ok', { status: 200 })]);
    restore = outbound.restore;
    const failed = await callJson<{ ok: boolean; error?: string }>(`/api/v1/projects/${project.id}/destinations/${created.body.destination.id}/test`, { method: 'POST', headers: adminHeaders });
    expect(failed.body).toEqual({ ok: false, error: 'destination_http_404' });
    const ok = await callJson<{ ok: boolean }>(`/api/v1/projects/${project.id}/destinations/${created.body.destination.id}/test`, { method: 'POST', headers: adminHeaders });
    expect(ok.body.ok).toBe(true);
    const list = await callJson<{ feedback: unknown[] }>(`/api/v1/projects/${project.id}/feedback`, { headers: adminHeaders });
    expect(list.body.feedback).toHaveLength(0);
    expect((await call('/health')).status).toBe(200);
  });
});

describe('email destinations', () => {
  it('renders a readable email with the image inline and a reply-to', async () => {
    const { buildEmail } = await import('../src/delivery');
    const project = { id: 'prj_x', slug: 'goaley', name: 'Goaley', bundle_id: null, accent: null, retention_days: 30, icon_url: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
    const feedback = {
      id: '33333333-3333-4333-8333-333333333333', project_id: 'prj_x', category: 'bug' as const, status: 'new' as const,
      message: 'The <sheet> clips & hides the button', name: 'Marta', reply_email: 'marta@example.com',
      context: { app_version: '3.2.0', build_number: '410', os_version: '18.4', locale: 'de-DE', device_family: 'iPhone', device_model: 'iPhone16,1' },
      user: { id: null, account_status: 'paid' as const, plan: 'pro', entitlements: ['pro'], attributes: {} },
      attachment: { content_type: 'image/jpeg' as const, byte_count: 100, url: 'https://fb.test/v1/attachments/abc' },
      internal_note: null, created_at: '2026-11-06T00:00:00.000Z', updated_at: '2026-11-06T00:00:00.000Z',
    };
    const email = buildEmail(project, feedback, 'https://fb.test');
    expect(email.subject).toBe('[Goaley] Bug: The <sheet> clips & hides the button');
    expect(email.html).toContain('The &lt;sheet&gt; clips &amp; hides the button');
    expect(email.html).toContain('<img src="https://fb.test/v1/attachments/abc"');
    expect(email.html).toContain('https://fb.test/p/prj_x/f/33333333-3333-4333-8333-333333333333');
    expect(email.text).toContain('From: Marta · marta@example.com');
  });

  it('creates email destinations, validates addresses, and fails cleanly without the binding', async () => {
    const project = await createProject('Email Project');
    const bad = await callJson<{ error: string }>(`/api/v1/projects/${project.id}/destinations`, {
      method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'email', url: 'not-an-address' }),
    });
    expect(bad.status).toBe(422);
    const created = await callJson<{ destination: { id: string; url: string } }>(`/api/v1/projects/${project.id}/destinations`, {
      method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'email', url: ' Me@Example.com ' }),
    });
    expect(created.status).toBe(201);
    expect(created.body.destination.url).toBe('me@example.com');
    const sent = await submit(project.public_key, validSubmission, { 'X-Feedback-Installation-ID': crypto.randomUUID() });
    expect(sent.status, JSON.stringify(sent.body)).toBe(202);
    const detail = await callJson<{ deliveries: Array<{ status: string; last_error: string | null }> }>(`/api/v1/feedback/${sent.body.feedback_id}`, { headers: adminHeaders });
    // The local Email Sending binding enforces the allowed recipient list, like production.
    expect(detail.body.deliveries[0]?.status).toBe('failed');
    expect(detail.body.deliveries[0]?.last_error).toContain('not allowed');

    const allowed = await callJson<{ destination: { id: string } }>(`/api/v1/projects/${project.id}/destinations`, {
      method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'email', url: 'swapnanildhol@gmail.com', categories: ['idea'] }),
    });
    expect(allowed.status).toBe(201);
    const idea = await submit(project.public_key, { ...validSubmission, category: 'idea' }, { 'X-Feedback-Installation-ID': crypto.randomUUID() });
    const ideaDetail = await callJson<{ deliveries: Array<{ destination_id: string; status: string; last_error: string | null }> }>(`/api/v1/feedback/${idea.body.feedback_id}`, { headers: adminHeaders });
    const toAllowed = ideaDetail.body.deliveries.find((delivery) => delivery.destination_id === allowed.body.destination.id);
    expect(toAllowed, JSON.stringify(ideaDetail.body.deliveries)).toMatchObject({ status: 'delivered' });
  });
});
