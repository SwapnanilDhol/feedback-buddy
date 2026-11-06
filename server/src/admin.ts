import { Hono } from 'hono';

import { adminAttachmentUrl, streamAttachment } from './attachments';
import { requireAdmin } from './auth';
import { type Mailer, deliverFeedback, destinationAccepts, sampleFeedback, sendEmailNotification, sendToDestination } from './delivery';
import { ApiError, isUuid, publicBaseUrl, readLimitedRequestJson } from './http';
import { generatePublicKey } from './keys';
import { errorMessage } from './log';
import {
  type Project,
  createDestination,
  createProject,
  deleteDestination,
  deleteFeedback,
  insertApiKey,
  listApiKeys,
  listDeliveriesWithKinds,
  listDestinations,
  listFeedback,
  listProjects,
  readDestination,
  readFeedback,
  readProject,
  requeueFailedDeliveries,
  revokeApiKey,
  slugify,
  toDestination,
  toFeedback,
  uniqueSlug,
  updateDestination,
  updateFeedback,
  updateProject,
} from './repository';
import {
  createDestinationSchema,
  createProjectSchema,
  listFeedbackQuerySchema,
  patchDestinationSchema,
  patchFeedbackSchema,
  patchProjectSchema,
} from './schema';
import type { z } from 'zod';

type Bindings = { Bindings: Env; Variables: { sessionId?: string } };

const maximumAdminBodyBytes = 32 * 1024;

export const admin = new Hono<Bindings>();
admin.use('*', requireAdmin);

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(422, 'invalid_request');
  return parsed.data;
}

async function loadProject(env: Env, id: string): Promise<Project> {
  const project = await readProject(env.DB, id);
  if (!project) throw new ApiError(404, 'project_not_found');
  return project;
}

// ----- Shared operations used by both the JSON API and the dashboard forms -----

export async function createProjectWithKey(
  env: Env,
  input: z.infer<typeof createProjectSchema>,
): Promise<{ project: Project; public_key: string }> {
  const slug = await uniqueSlug(env.DB, input.slug ?? slugify(input.name));
  const project = await createProject(env.DB, {
    name: input.name,
    slug,
    bundle_id: input.bundle_id ?? null,
    retention_days: input.retention_days,
    accent: input.accent ?? null,
  });
  const key = await generatePublicKey();
  await insertApiKey(env.DB, { project_id: project.id, prefix: key.prefix, hash: key.hash });
  return { project, public_key: key.plaintext };
}

export async function issueKey(env: Env, projectId: string) {
  const key = await generatePublicKey();
  const record = await insertApiKey(env.DB, { project_id: projectId, prefix: key.prefix, hash: key.hash });
  return { key: record, public_key: key.plaintext };
}

export async function testDestination(env: Env, project: Project, destinationId: string): Promise<{ ok: boolean; error?: string }> {
  const destination = await readDestination(env.DB, project.id, destinationId);
  if (!destination) throw new ApiError(404, 'destination_not_found');
  try {
    const target = { project, feedback: sampleFeedback(project), destination, deliveryId: crypto.randomUUID() };
    if (destination.kind === 'email') {
      await sendEmailNotification(target, env.EMAIL as Mailer | undefined, env.EMAIL_FROM, env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, '') || 'https://feedback-buddy.invalid');
    } else {
      await sendToDestination(target);
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function redeliverFeedback(env: Env, baseUrl: string, feedbackId: string): Promise<number> {
  const requeued = await requeueFailedDeliveries(env.DB, feedbackId);
  if (requeued > 0) await deliverFeedback(env, baseUrl, feedbackId);
  return requeued;
}

// ----- Projects -----

admin.get('/projects', async (context) => {
  return context.json({ projects: await listProjects(context.env.DB) });
});

admin.post('/projects', async (context) => {
  const input = parse(createProjectSchema, await readLimitedRequestJson(context.req.raw, maximumAdminBodyBytes));
  return context.json(await createProjectWithKey(context.env, input), 201);
});

admin.get('/projects/:id', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const [keys, destinations] = await Promise.all([
    listApiKeys(context.env.DB, project.id),
    listDestinations(context.env.DB, project.id),
  ]);
  return context.json({ project, keys, destinations: destinations.map(toDestination) });
});

admin.patch('/projects/:id', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const patch = parse(patchProjectSchema, await readLimitedRequestJson(context.req.raw, maximumAdminBodyBytes));
  return context.json({ project: await updateProject(context.env.DB, project.id, patch) });
});

admin.delete('/feedback/:feedbackId', async (context) => {
  const feedbackId = context.req.param('feedbackId');
  if (!isUuid(feedbackId)) throw new ApiError(404, 'feedback_not_found');
  const removed = await deleteFeedback(context.env.DB, feedbackId);
  if (!removed) throw new ApiError(404, 'feedback_not_found');
  if (removed.attachment_key) await context.env.ATTACHMENTS.delete(removed.attachment_key);
  return context.json({ ok: true });
});

// ----- Keys -----

admin.post('/projects/:id/keys', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  return context.json(await issueKey(context.env, project.id), 201);
});

admin.delete('/projects/:id/keys/:keyId', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const revoked = await revokeApiKey(context.env.DB, project.id, context.req.param('keyId'));
  if (!revoked) throw new ApiError(404, 'key_not_found');
  return context.json({ ok: true });
});

// ----- Destinations -----

admin.post('/projects/:id/destinations', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const input = parse(createDestinationSchema, await readLimitedRequestJson(context.req.raw, maximumAdminBodyBytes));
  const row = await createDestination(context.env.DB, {
    project_id: project.id,
    kind: input.kind,
    url: input.url,
    secret: input.secret ?? null,
    categories: input.categories,
  });
  return context.json({ destination: toDestination(row) }, 201);
});

admin.patch('/projects/:id/destinations/:destId', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const patch = parse(patchDestinationSchema, await readLimitedRequestJson(context.req.raw, maximumAdminBodyBytes));
  const row = await updateDestination(context.env.DB, project.id, context.req.param('destId'), patch);
  if (!row) throw new ApiError(404, 'destination_not_found');
  return context.json({ destination: toDestination(row) });
});

admin.delete('/projects/:id/destinations/:destId', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const deleted = await deleteDestination(context.env.DB, project.id, context.req.param('destId'));
  if (!deleted) throw new ApiError(404, 'destination_not_found');
  return context.json({ ok: true });
});

admin.post('/projects/:id/destinations/:destId/test', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  return context.json(await testDestination(context.env, project, context.req.param('destId')));
});

// ----- Feedback -----

admin.get('/projects/:id/feedback', async (context) => {
  const project = await loadProject(context.env, context.req.param('id'));
  const query = parse(listFeedbackQuerySchema, context.req.query());
  const { rows, next_cursor } = await listFeedback(context.env.DB, project.id, query);
  const feedback = rows.map((row) => toFeedback(row, adminAttachmentUrl));
  return context.json(next_cursor ? { feedback, next_cursor } : { feedback });
});

admin.get('/feedback/:feedbackId', async (context) => {
  const feedbackId = context.req.param('feedbackId');
  if (!isUuid(feedbackId)) throw new ApiError(404, 'feedback_not_found');
  const row = await readFeedback(context.env.DB, feedbackId);
  if (!row) throw new ApiError(404, 'feedback_not_found');
  const deliveries = await listDeliveriesWithKinds(context.env.DB, row.id);
  return context.json({ feedback: toFeedback(row, adminAttachmentUrl), deliveries });
});

admin.patch('/feedback/:feedbackId', async (context) => {
  const feedbackId = context.req.param('feedbackId');
  if (!isUuid(feedbackId)) throw new ApiError(404, 'feedback_not_found');
  const patch = parse(patchFeedbackSchema, await readLimitedRequestJson(context.req.raw, maximumAdminBodyBytes));
  const row = await updateFeedback(context.env.DB, feedbackId, patch);
  if (!row) throw new ApiError(404, 'feedback_not_found');
  return context.json({ feedback: toFeedback(row, adminAttachmentUrl) });
});

admin.get('/feedback/:feedbackId/attachment', async (context) => {
  const feedbackId = context.req.param('feedbackId');
  if (!isUuid(feedbackId)) throw new ApiError(404, 'not_found');
  const row = await readFeedback(context.env.DB, feedbackId);
  if (!row) throw new ApiError(404, 'not_found');
  return streamAttachment(context.env, row);
});

admin.post('/feedback/:feedbackId/redeliver', async (context) => {
  const feedbackId = context.req.param('feedbackId');
  if (!isUuid(feedbackId)) throw new ApiError(404, 'feedback_not_found');
  const row = await readFeedback(context.env.DB, feedbackId);
  if (!row) throw new ApiError(404, 'feedback_not_found');
  const requeued = await redeliverFeedback(context.env, publicBaseUrl(context.env, context.req.raw), row.id);
  return context.json({ ok: true, requeued }, 202);
});

/** Shared by the dashboard: decide whether a destination would receive a category. */
export { destinationAccepts };
