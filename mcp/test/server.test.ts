import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';

import { FeedbackBuddyClient } from '../src/client.js';
import { createServer } from '../src/server.js';

const project = { id: 'prj_1', slug: 'goaley', key: 'GOA', name: 'Goaley', bundle_id: 'com.swapnanildhol.Goaley', icon_url: null, counts: { todo: 1, in_progress: 0, done: 0, wont_do: 0 } };
const feedback = {
  id: '33333333-3333-4333-8333-333333333333', key: 'GOA-1', number: 1, project_id: 'prj_1', category: 'bug', status: 'todo', message: 'It clips', name: null, reply_email: null,
  context: { app_version: '1.0', build_number: '1', os_version: '26.0', locale: 'en', device_family: 'iPhone', device_model: null },
  user: { id: null, account_status: 'unknown', plan: null, entitlements: [], attributes: {} },
  attachment: { content_type: 'image/jpeg', byte_count: 4, url: '/api/v1/feedback/33333333-3333-4333-8333-333333333333/attachment' },
  internal_note: null, created_at: '2026-11-06T00:00:00.000Z', updated_at: '2026-11-06T00:00:00.000Z',
};

function fakeApi(): { fetcher: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}${url.search}`);
    expect(request.headers.get('authorization')).toBe('Bearer tok');
    if (url.pathname === '/api/v1/projects') return Response.json({ projects: [project] });
    if (url.pathname === '/api/v1/projects/prj_1/feedback') return Response.json({ feedback: [feedback], next_cursor: null });
    if (url.pathname === `/api/v1/feedback/${feedback.id}` && request.method === 'GET') return Response.json({ feedback, deliveries: [] });
    if (url.pathname === `/api/v1/feedback/${feedback.id}` && request.method === 'PATCH') return Response.json({ feedback: { ...feedback, ...(await request.json() as object) } });
    if (url.pathname === `/api/v1/feedback/${feedback.id}/attachment`) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), { headers: { 'content-type': 'image/jpeg' } });
    return Response.json({ error: 'not_found' }, { status: 404 });
  }) as typeof fetch;
  return { fetcher, calls };
}

async function connect() {
  const api = fakeApi();
  const server = createServer(new FeedbackBuddyClient({ baseUrl: 'https://fb.test/', token: 'tok', fetcher: api.fetcher }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(clientTransport);
  return { client, api };
}

describe('feedback-buddy MCP server', () => {
  it('exposes the triage tools', async () => {
    const { client } = await connect();
    const names = (await client.listTools()).tools.map((tool) => tool.name).sort();
    expect(names).toEqual(['create_project', 'delete_feedback', 'get_attachment', 'get_feedback', 'list_feedback', 'list_projects', 'overview', 'update_feedback']);
  });

  it('resolves projects by slug and filters feedback', async () => {
    const { client, api } = await connect();
    const result = await client.callTool({ name: 'list_feedback', arguments: { project: 'Goaley', status: 'todo' } });
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as { app: string; feedback: Array<{ has_image: boolean }> };
    expect(payload.app).toBe('Goaley');
    expect(payload.feedback[0]?.has_image).toBe(true);
    expect(api.calls).toContain('GET /api/v1/projects/prj_1/feedback?limit=25&status=todo');
    await expect(client.callTool({ name: 'list_feedback', arguments: { project: 'nope' } })).resolves.toMatchObject({ isError: true });
  });

  it('returns attachments as images and patches status', async () => {
    const { client, api } = await connect();
    const image = await client.callTool({ name: 'get_attachment', arguments: { feedback_id: feedback.id } });
    expect((image.content as Array<{ type: string; mimeType?: string }>)[0]).toMatchObject({ type: 'image', mimeType: 'image/jpeg' });
    await client.callTool({ name: 'update_feedback', arguments: { feedback_id: feedback.id, status: 'in_progress' } });
    expect(api.calls).toContain(`PATCH /api/v1/feedback/${feedback.id}`);
  });
});
