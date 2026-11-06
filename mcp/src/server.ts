import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { FeedbackBuddyClient } from './client.js';

const status = z.enum(['todo', 'in_progress', 'done', 'wont_do']);
const statusFilter = z.enum(['todo', 'in_progress', 'done', 'wont_do', 'open']);
const category = z.enum(['feedback', 'bug', 'idea']);

interface Project { id: string; slug: string; key: string; name: string; bundle_id: string | null; icon_url: string | null; counts?: { todo: number; in_progress: number; done: number; wont_do: number } }
interface Feedback {
  id: string; key: string; number: number; project_id: string; category: string; status: string; message: string; name: string | null; reply_email: string | null;
  context: { app_version: string; build_number: string; os_version: string; locale: string; device_family: string; device_model: string | null };
  user: { id: string | null; account_status: string; plan: string | null; entitlements: string[]; attributes: Record<string, string> };
  attachment: { content_type: string; byte_count: number; url: string } | null;
  internal_note: string | null; created_at: string; updated_at: string;
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

/** Resolves a project by id, slug, name or bundle id so agents can say "goaley". */
async function resolveProject(client: FeedbackBuddyClient, ref: string): Promise<Project> {
  const { projects } = await client.json<{ projects: Project[] }>('GET', '/api/v1/projects');
  const needle = ref.trim().toLowerCase();
  const match = projects.find((project) =>
    project.id === ref || project.slug === needle || project.name.toLowerCase() === needle || project.bundle_id?.toLowerCase() === needle,
  );
  if (!match) throw new Error(`No project matches "${ref}". Known: ${projects.map((project) => project.slug).join(', ')}`);
  return match;
}

export function createServer(client: FeedbackBuddyClient): McpServer {
  const server = new McpServer({ name: 'feedback-buddy', version: '0.1.0' }, {
    instructions:
      'FeedbackBuddy holds in-app feedback (feedback, bug reports, ideas) for a set of iOS apps. ' +
      'Use list_projects to see apps, list_feedback to pull messages (filter by status "new" to triage), ' +
      'get_feedback for full detail, get_attachment to view a screenshot, and update_feedback to set status or an internal note. ' +
      'Projects can be referenced by slug, name, bundle id or id.',
  });

  server.registerTool('list_projects', {
    title: 'List apps',
    description: 'All apps (projects) with their issue key prefix and counts of feedback by status (todo, in_progress, done, wont_do).',
    inputSchema: {},
  }, async () => {
    const { projects } = await client.json<{ projects: Project[] }>('GET', '/api/v1/projects');
    return text(projects.map(({ id, slug, key, name, bundle_id, counts }) => ({ id, slug, key, name, bundle_id, counts })));
  });

  server.registerTool('overview', {
    title: 'Overview',
    description: 'Newest feedback across every app, with per-app counts. Good first call when asked "anything new?".',
    inputSchema: { limit: z.number().int().min(1).max(50).default(15).describe('How many recent items to include') },
  }, async ({ limit }) => {
    const { projects } = await client.json<{ projects: Project[] }>('GET', '/api/v1/projects');
    const perProject = await Promise.all(projects.map(async (project) => {
      const { feedback } = await client.json<{ feedback: Feedback[] }>('GET', `/api/v1/projects/${project.id}/feedback?limit=${limit}`);
      return feedback.map((item) => ({ ...item, app: project.name, app_slug: project.slug }));
    }));
    const latest = perProject.flat().sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    return text({
      apps: projects.map(({ slug, name, counts }) => ({ slug, name, counts })),
      latest: latest.map(({ id, key, app, app_slug, category, status, message, name, reply_email, context, attachment, created_at }) =>
        ({ id, key, app, app_slug, category, status, message, name, reply_email, app_version: context.app_version, has_image: Boolean(attachment), created_at })),
    });
  });

  server.registerTool('list_feedback', {
    title: 'List feedback for an app',
    description: 'Feedback for one app, newest first. Filter by status (todo, in_progress, done, wont_do, or open = todo+in_progress), category, app version or a search term. Returns a cursor for older pages.',
    inputSchema: {
      project: z.string().describe('App slug, name, bundle id or project id (e.g. "goaley")'),
      status: statusFilter.optional(),
      category: category.optional(),
      app_version: z.string().optional(),
      q: z.string().max(200).optional().describe('Search in message, name and email'),
      limit: z.number().int().min(1).max(100).default(25),
      cursor: z.string().optional(),
    },
  }, async ({ project, limit, cursor, ...filters }) => {
    const resolved = await resolveProject(client, project);
    const params = new URLSearchParams({ limit: String(limit) });
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    if (cursor) params.set('cursor', cursor);
    const result = await client.json<{ feedback: Feedback[]; next_cursor?: string | null }>('GET', `/api/v1/projects/${resolved.id}/feedback?${params}`);
    return text({
      app: resolved.name,
      feedback: result.feedback.map(({ id, key, category, status, message, name, reply_email, context, user, attachment, internal_note, created_at }) =>
        ({ id, key, category, status, message, name, reply_email, app_version: context.app_version, build: context.build_number, os: context.os_version, device: context.device_family, account: user.account_status, plan: user.plan, has_image: Boolean(attachment), internal_note, created_at })),
      next_cursor: result.next_cursor ?? null,
    });
  });

  server.registerTool('get_feedback', {
    title: 'Get one feedback item',
    description: 'Full detail for one feedback id, including context, user info, attachment metadata and delivery state.',
    inputSchema: { feedback_id: z.string().uuid() },
  }, async ({ feedback_id }) => text(await client.json('GET', `/api/v1/feedback/${feedback_id}`)));

  server.registerTool('get_attachment', {
    title: 'View attached image',
    description: 'Returns the screenshot attached to a feedback item as an image, if there is one.',
    inputSchema: { feedback_id: z.string().uuid() },
  }, async ({ feedback_id }) => {
    const { feedback } = await client.json<{ feedback: Feedback }>('GET', `/api/v1/feedback/${feedback_id}`);
    if (!feedback.attachment) return text('This feedback has no attachment.');
    const { contentType, data } = await client.bytes(`/api/v1/feedback/${feedback_id}/attachment`);
    return { content: [{ type: 'image' as const, data: Buffer.from(data).toString('base64'), mimeType: contentType.split(';')[0] ?? 'image/jpeg' }] };
  });

  server.registerTool('update_feedback', {
    title: 'Update status or note',
    description: 'Set the workflow status (todo, in_progress, done, wont_do) and/or an internal note on a feedback item.',
    inputSchema: {
      feedback_id: z.string().uuid(),
      status: status.optional(),
      internal_note: z.string().max(4000).nullable().optional().describe('Replaces the note; null clears it'),
    },
  }, async ({ feedback_id, ...patch }) => {
    const body = Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined));
    if (Object.keys(body).length === 0) throw new Error('Provide status and/or internal_note.');
    return text(await client.json('PATCH', `/api/v1/feedback/${feedback_id}`, body));
  });

  server.registerTool('delete_feedback', {
    title: 'Delete feedback',
    description: 'Permanently deletes a feedback item and its attachment. Use for test submissions only.',
    inputSchema: { feedback_id: z.string().uuid() },
  }, async ({ feedback_id }) => text(await client.json('DELETE', `/api/v1/feedback/${feedback_id}`)));

  server.registerTool('create_project', {
    title: 'Create an app',
    description: 'Creates a project for an app and returns its public key once. The key goes into FeedbackBuddy.configure(apiKey:).',
    inputSchema: { name: z.string().min(1).max(80), bundle_id: z.string().max(120).optional(), retention_days: z.number().int().min(1).max(365).optional() },
  }, async (input) => text(await client.json('POST', '/api/v1/projects', input)));

  return server;
}
