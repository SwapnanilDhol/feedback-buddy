import { describe, expect, it } from 'vitest';

import type { Feedback } from '../src/repository';
import { adminHeaders, call, callJson, createProject, submit, validSubmission } from './helpers';

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

describe('admin API', () => {
  it('requires the admin bearer token', async () => {
    expect((await call('/api/v1/projects')).status).toBe(401);
    expect((await call('/api/v1/projects', { headers: { Authorization: 'Bearer wrong' } })).status).toBe(401);
  });

  it('creates a project with a one-time plaintext key and lists it with counts', async () => {
    const created = await callJson<{ project: { id: string; slug: string; retention_days: number }; public_key: string }>(
      '/api/v1/projects',
      jsonInit('POST', { name: 'Goaley: Savings Goal Tracker', bundle_id: 'com.swapnanildhol.Goaley' }),
    );
    expect(created.status).toBe(201);
    expect(created.body.public_key).toMatch(/^fb_pub_/);
    expect(created.body.project.slug).toBe('goaley-savings-goal-tracker');
    expect(created.body.project.retention_days).toBe(30);

    const detail = await callJson<{ keys: Array<{ prefix: string; hash?: string }>; destinations: unknown[] }>(
      `/api/v1/projects/${created.body.project.id}`,
      { headers: adminHeaders },
    );
    expect(detail.body.keys).toHaveLength(1);
    expect(detail.body.keys[0]?.prefix).toBe(created.body.public_key.slice(0, 12));
    expect(detail.body.keys[0]?.hash).toBeUndefined();
    expect(JSON.stringify(detail.body)).not.toContain(created.body.public_key);

    await submit(created.body.public_key);
    const list = await callJson<{ projects: Array<{ id: string; key: string; counts: { todo: number } }> }>('/api/v1/projects', { headers: adminHeaders });
    const listed = list.body.projects.find((project) => project.id === created.body.project.id);
    expect(listed?.counts.todo).toBe(1);
    expect(listed?.key).toMatch(/^[A-Z0-9]{2,6}$/);

    const duplicateSlug = await callJson<{ project: { slug: string } }>('/api/v1/projects', jsonInit('POST', { name: 'Goaley: Savings Goal Tracker' }));
    expect(duplicateSlug.body.project.slug).toBe('goaley-savings-goal-tracker-2');
    expect((await callJson('/api/v1/projects', jsonInit('POST', { name: '' }))).status).toBe(422);
  });

  it('lists, filters, searches and paginates feedback', async () => {
    const project = await createProject();
    for (let index = 0; index < 4; index += 1) {
      await submit(project.public_key, { ...validSubmission, message: `Message number ${index} needle${index}`, category: index % 2 ? 'idea' : 'bug' }, {
        'X-Feedback-Installation-ID': crypto.randomUUID(),
      });
    }
    await submit(project.public_key, { ...validSubmission, context: { ...validSubmission.context, app_version: '6.0' }, name: 'Zed Finder' }, {
      'X-Feedback-Installation-ID': crypto.randomUUID(),
    });
    const all = await callJson<{ feedback: Feedback[]; next_cursor?: string }>(`/api/v1/projects/${project.id}/feedback`, { headers: adminHeaders });
    expect(all.body.feedback).toHaveLength(5);
    expect(all.body.next_cursor).toBeUndefined();
    expect(Date.parse(all.body.feedback[0]!.created_at)).toBeGreaterThanOrEqual(Date.parse(all.body.feedback[4]!.created_at));

    const bugs = await callJson<{ feedback: Feedback[] }>(`/api/v1/projects/${project.id}/feedback?category=bug`, { headers: adminHeaders });
    expect(bugs.body.feedback.every((item) => item.category === 'bug')).toBe(true);
    expect(bugs.body.feedback).toHaveLength(3);

    const version = await callJson<{ feedback: Feedback[] }>(`/api/v1/projects/${project.id}/feedback?app_version=6.0`, { headers: adminHeaders });
    expect(version.body.feedback).toHaveLength(1);

    const search = await callJson<{ feedback: Feedback[] }>(`/api/v1/projects/${project.id}/feedback?q=needle2`, { headers: adminHeaders });
    expect(search.body.feedback).toHaveLength(1);
    const byName = await callJson<{ feedback: Feedback[] }>(`/api/v1/projects/${project.id}/feedback?q=zed`, { headers: adminHeaders });
    expect(byName.body.feedback).toHaveLength(1);
    const escaped = await callJson<{ feedback: Feedback[] }>(`/api/v1/projects/${project.id}/feedback?q=%25`, { headers: adminHeaders });
    expect(escaped.body.feedback).toHaveLength(0);

    const page1 = await callJson<{ feedback: Feedback[]; next_cursor?: string }>(`/api/v1/projects/${project.id}/feedback?limit=2`, { headers: adminHeaders });
    expect(page1.body.feedback).toHaveLength(2);
    expect(page1.body.next_cursor).toBeDefined();
    const page2 = await callJson<{ feedback: Feedback[]; next_cursor?: string }>(
      `/api/v1/projects/${project.id}/feedback?limit=2&cursor=${encodeURIComponent(page1.body.next_cursor ?? '')}`,
      { headers: adminHeaders },
    );
    expect(page2.body.feedback).toHaveLength(2);
    const page3 = await callJson<{ feedback: Feedback[]; next_cursor?: string }>(
      `/api/v1/projects/${project.id}/feedback?limit=2&cursor=${encodeURIComponent(page2.body.next_cursor ?? '')}`,
      { headers: adminHeaders },
    );
    expect(page3.body.feedback).toHaveLength(1);
    expect(page3.body.next_cursor).toBeUndefined();
    const ids = [...page1.body.feedback, ...page2.body.feedback, ...page3.body.feedback].map((item) => item.id);
    expect(new Set(ids).size).toBe(5);
    expect((await call(`/api/v1/projects/${project.id}/feedback?limit=500`, { headers: adminHeaders })).status).toBe(422);
  });

  it('updates status and notes', async () => {
    const project = await createProject();
    const { body } = await submit(project.public_key);
    const patched = await callJson<{ feedback: Feedback }>(`/api/v1/feedback/${body.feedback_id}`, jsonInit('PATCH', { status: 'in_progress', internal_note: 'Reproduced on 26.0' }));
    expect(patched.status).toBe(200);
    expect(patched.body.feedback.status).toBe('in_progress');
    expect(patched.body.feedback.key).toMatch(/^[A-Z0-9]{2,6}-1$/);
    expect(patched.body.feedback.internal_note).toBe('Reproduced on 26.0');
    expect((await callJson(`/api/v1/feedback/${body.feedback_id}`, jsonInit('PATCH', { status: 'closed' }))).status).toBe(422);
    expect((await callJson(`/api/v1/feedback/${body.feedback_id}`, jsonInit('PATCH', {}))).status).toBe(422);
    expect((await call(`/api/v1/feedback/${crypto.randomUUID()}`, { headers: adminHeaders })).status).toBe(404);
  });

  it('rotates and revokes keys', async () => {
    const project = await createProject();
    const rotated = await callJson<{ key: { id: string }; public_key: string }>(`/api/v1/projects/${project.id}/keys`, { method: 'POST', headers: adminHeaders });
    expect(rotated.status).toBe(201);
    expect((await submit(rotated.body.public_key)).status).toBe(202);
    expect((await submit(project.public_key)).status).toBe(202);

    const detail = await callJson<{ keys: Array<{ id: string; prefix: string }> }>(`/api/v1/projects/${project.id}`, { headers: adminHeaders });
    const original = detail.body.keys.find((key) => key.prefix === project.public_key.slice(0, 12));
    const revoke = await callJson<{ ok: boolean }>(`/api/v1/projects/${project.id}/keys/${original?.id}`, { method: 'DELETE', headers: adminHeaders });
    expect(revoke.body.ok).toBe(true);
    expect((await submit(project.public_key)).status).toBe(401);
    expect((await submit(rotated.body.public_key)).status).toBe(202);
    expect((await call(`/api/v1/projects/${project.id}/keys/${original?.id}`, { method: 'DELETE', headers: adminHeaders })).status).toBe(404);
  });

  it('manages destinations', async () => {
    const project = await createProject();
    const rejected = await callJson(`/api/v1/projects/${project.id}/destinations`, jsonInit('POST', { kind: 'webhook', url: 'https://example.com/hook' }));
    expect(rejected.status).toBe(422);
    const insecure = await callJson(`/api/v1/projects/${project.id}/destinations`, jsonInit('POST', { kind: 'slack_webhook', url: 'http://example.com/hook' }));
    expect(insecure.status).toBe(422);
    const created = await callJson<{ destination: { id: string; has_secret: boolean; categories: string[]; enabled: boolean } }>(
      `/api/v1/projects/${project.id}/destinations`,
      jsonInit('POST', { kind: 'webhook', url: 'https://example.com/hook', secret: 'super-secret-1', categories: ['bug'] }),
    );
    expect(created.status).toBe(201);
    expect(created.body.destination).toMatchObject({ has_secret: true, categories: ['bug'], enabled: true });
    expect(JSON.stringify(created.body)).not.toContain('super-secret-1');
    const patched = await callJson<{ destination: { enabled: boolean } }>(`/api/v1/projects/${project.id}/destinations/${created.body.destination.id}`, jsonInit('PATCH', { enabled: false }));
    expect(patched.body.destination.enabled).toBe(false);
    const removed = await callJson<{ ok: boolean }>(`/api/v1/projects/${project.id}/destinations/${created.body.destination.id}`, { method: 'DELETE', headers: adminHeaders });
    expect(removed.body.ok).toBe(true);
    expect((await call(`/api/v1/projects/${project.id}/destinations/${created.body.destination.id}`, { method: 'DELETE', headers: adminHeaders })).status).toBe(404);
  });
});

describe('project icon_url via PATCH', () => {
  it('accepts an https icon URL and rejects anything else', async () => {
    const project = await createProject('Icon Patch');
    const ok = await callJson<{ project: { icon_url: string | null } }>(`/api/v1/projects/${project.id}`, {
      method: 'PATCH', headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ icon_url: 'https://is1-ssl.mzstatic.com/image/thumb/x/256x256bb.png' }),
    });
    expect(ok.status).toBe(200);
    expect(ok.body.project.icon_url).toBe('https://is1-ssl.mzstatic.com/image/thumb/x/256x256bb.png');
    const bad = await callJson<{ error: string }>(`/api/v1/projects/${project.id}`, {
      method: 'PATCH', headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ icon_url: 'http://insecure.test/icon.png' }),
    });
    expect(bad.status).toBe(422);
    const cleared = await callJson<{ project: { icon_url: string | null } }>(`/api/v1/projects/${project.id}`, {
      method: 'PATCH', headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ icon_url: null }),
    });
    expect(cleared.body.project.icon_url).toBeNull();
  });
});

describe('DELETE feedback', () => {
  it('removes the record and its attachment', async () => {
    const project = await createProject('Delete Project');
    const { submitMultipart, multipart, fakeJpeg } = await import('./helpers');
    const uploaded = await submitMultipart(project.public_key, multipart(validSubmission, fakeJpeg(512)), { 'X-Feedback-Installation-ID': crypto.randomUUID() });
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(202);
    const { body } = uploaded;
    expect((await call(`/api/v1/feedback/${body.feedback_id}/attachment`, { headers: adminHeaders })).status).toBe(200);
    const removed = await callJson<{ ok: boolean }>(`/api/v1/feedback/${body.feedback_id}`, { method: 'DELETE', headers: adminHeaders });
    expect(removed.status).toBe(200);
    expect((await call(`/api/v1/feedback/${body.feedback_id}`, { headers: adminHeaders })).status).toBe(404);
    expect((await call(`/api/v1/feedback/${body.feedback_id}/attachment`, { headers: adminHeaders })).status).toBe(404);
    expect((await call(`/api/v1/feedback/${body.feedback_id}`, { method: 'DELETE', headers: adminHeaders })).status).toBe(404);
  });
});

describe('overview endpoint', () => {
  it('returns projects with counts, stats, latest feedback, and app versions per project', async () => {
    const project = await createProject('Overview Project');
    await submit(project.public_key, { ...validSubmission, context: { ...validSubmission.context, app_version: '9.9' } }, { 'X-Feedback-Installation-ID': crypto.randomUUID() });
    const overview = await callJson<{ projects: Array<{ id: string; counts: { todo: number } }>; stats: { open: number; todo: number; open_bugs: number; last_7_days: number; awaiting_reply: number }; latest: Array<{ key: string; project_id: string }> }>('/api/v1/overview', { headers: adminHeaders });
    expect(overview.status).toBe(200);
    expect(overview.body.projects.find((item) => item.id === project.id)?.counts.todo).toBe(1);
    expect(overview.body.stats.open).toBeGreaterThanOrEqual(1);
    expect(overview.body.latest.some((item) => item.project_id === project.id)).toBe(true);
    const detail = await callJson<{ app_versions: string[] }>(`/api/v1/projects/${project.id}`, { headers: adminHeaders });
    expect(detail.body.app_versions).toEqual(['9.9']);
  });
});
