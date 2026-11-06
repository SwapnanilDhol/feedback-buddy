import { Hono } from 'hono';

import { adminAttachmentUrl, streamAttachment } from './attachments';
import { requireAdmin, verifyPassword } from './auth';
import {
  authenticationOptions,
  completeAuthentication,
  completeRegistration,
  deletePasskey,
  listPasskeys,
  registrationOptions,
  toPasskey,
  type RelyingParty,
} from './passkeys';
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

// ----- Operator auth for external dashboards -----
// A separate front end (the Next.js dashboard) keeps its own session and asks
// the Worker to check the password or run the WebAuthn ceremonies. The relying
// party is the dashboard's own host, so it must be on the allow-list.

const hostnamePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

function allowedRelyingParty(context: { env: Env; req: { url: string } }, body: Record<string, unknown>): RelyingParty {
  const rpId = typeof body.rp_id === 'string' ? body.rp_id.trim().toLowerCase() : '';
  const origin = typeof body.origin === 'string' ? body.origin.trim() : '';
  if (!hostnamePattern.test(rpId) || rpId.length > 253) throw new ApiError(422, 'invalid_rp_id');
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError(422, 'invalid_origin');
  }
  const host = originUrl.hostname.toLowerCase();
  if (host !== rpId && !host.endsWith(`.${rpId}`)) throw new ApiError(422, 'origin_rp_mismatch');
  if (originUrl.protocol !== 'https:' && rpId !== 'localhost') throw new ApiError(422, 'origin_not_https');
  const own = new URL(context.req.url).hostname.toLowerCase();
  const allowed = new Set([own, 'localhost', ...(context.env.ALLOWED_RP_IDS ?? '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)]);
  if (!allowed.has(rpId)) throw new ApiError(403, 'rp_not_allowed');
  return { rpID: rpId, origin: originUrl.origin };
}

function requiredString(body: Record<string, unknown>, field: string, max = 4096): string {
  const value = body[field];
  if (typeof value !== 'string' || value.length === 0 || value.length > max) throw new ApiError(422, `invalid_${field}`);
  return value;
}

function credentialBody(value: unknown): Record<string, unknown> & { id: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(422, 'invalid_credential');
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0 || record.id.length > 1024) throw new ApiError(422, 'invalid_credential');
  return record as Record<string, unknown> & { id: string };
}

admin.post('/auth/password', async (context) => {
  const body = await readLimitedRequestJson(context.req.raw, 4 * 1024);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!verifyPassword(password, context.env)) throw new ApiError(401, 'invalid_password');
  return context.json({ ok: true });
});

admin.get('/auth/passkeys', async (context) => {
  const rows = await listPasskeys(context.env.DB);
  return context.json({ passkeys: rows.map(toPasskey) });
});

admin.post('/auth/passkeys/registration-options', async (context) => {
  const body = await readLimitedRequestJson(context.req.raw, 4 * 1024);
  const party = allowedRelyingParty(context, body);
  return context.json(await registrationOptions(context.env.DB, party));
});

admin.post('/auth/passkeys', async (context) => {
  const body = await readLimitedRequestJson(context.req.raw, 64 * 1024);
  const party = allowedRelyingParty(context, body);
  const challenge = requiredString(body, 'challenge', 512);
  const name = (typeof body.name === 'string' ? body.name : '').trim().slice(0, 60) || 'Passkey';
  const credential = credentialBody(body.response);
  const passkey = await completeRegistration(context.env.DB, party, challenge, name, credential as unknown as Parameters<typeof completeRegistration>[4]);
  if (!passkey) throw new ApiError(422, 'passkey_rejected');
  return context.json({ passkey }, 201);
});

admin.delete('/auth/passkeys/:id', async (context) => {
  const removed = await deletePasskey(context.env.DB, context.req.param('id'));
  if (!removed) throw new ApiError(404, 'passkey_not_found');
  return context.json({ ok: true });
});

admin.post('/auth/passkeys/authentication-options', async (context) => {
  const body = await readLimitedRequestJson(context.req.raw, 4 * 1024);
  const party = allowedRelyingParty(context, body);
  if ((await listPasskeys(context.env.DB)).length === 0) throw new ApiError(404, 'no_passkeys');
  return context.json(await authenticationOptions(context.env.DB, party));
});

admin.post('/auth/passkeys/authenticate', async (context) => {
  const body = await readLimitedRequestJson(context.req.raw, 64 * 1024);
  const party = allowedRelyingParty(context, body);
  const challenge = requiredString(body, 'challenge', 512);
  const credential = credentialBody(body.response);
  const passkey = await completeAuthentication(context.env.DB, party, challenge, credential as unknown as Parameters<typeof completeAuthentication>[3]);
  if (!passkey) throw new ApiError(401, 'passkey_rejected');
  return context.json({ ok: true, passkey: { id: passkey.id, name: passkey.name } });
});
