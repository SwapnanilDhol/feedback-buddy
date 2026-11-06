import type { Context } from 'hono';

import {
  attachmentCapabilityToken,
  attachmentObjectKey,
  detectImageType,
  maximumAttachmentBytes,
  minimumAttachmentBytes,
  type AttachmentContentType,
} from './attachments';
import { deliverFeedback, destinationAccepts, summarizeDeliveryStatus } from './delivery';
import { ApiError, isUuid, parseJsonObject, publicBaseUrl, readLimitedRequestText } from './http';
import { hashKey, looksLikePublicKey } from './keys';
import { errorMessage, writeLog } from './log';
import {
  countRecentByInstallation,
  countRecentByProject,
  createDeliveries,
  insertFeedback,
  listDeliveriesForFeedback,
  listDestinations,
  resolveProjectByKeyHash,
  type Project,
} from './repository';
import { submissionSchema, type Submission } from './schema';
import { bearerToken, sha256Hex } from './security';

const maximumJsonBytes = 16 * 1024;
const installationWindowMs = 10 * 60_000;
const installationLimit = 5;
const projectWindowMs = 60_000;
const projectLimit = 60;

export interface Receipt {
  feedback_id: string;
  duplicate: boolean;
  delivery_status: 'accepted' | 'delivered' | 'failed';
}

interface ParsedBody {
  payload: Record<string, unknown>;
  attachment: { bytes: Uint8Array; content_type: AttachmentContentType } | null;
}

export async function resolveProjectFromRequest(env: Env, authorization: string | undefined): Promise<Project> {
  const token = bearerToken(authorization);
  if (!token || !looksLikePublicKey(token)) throw new ApiError(401, 'invalid_api_key');
  const project = await resolveProjectByKeyHash(env.DB, await hashKey(token));
  if (!project) throw new ApiError(401, 'invalid_api_key');
  return project;
}

async function parseBody(request: Request): Promise<ParsedBody> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (contentType.startsWith('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(422, 'invalid_multipart');
    }
    const payloadPart = form.get('payload');
    const attachmentPart = form.get('attachment');
    if (typeof payloadPart !== 'string' || !(attachmentPart instanceof File)) {
      throw new ApiError(422, 'invalid_multipart');
    }
    if (payloadPart.length > maximumJsonBytes) throw new ApiError(413, 'payload_too_large');
    if (attachmentPart.size > maximumAttachmentBytes) throw new ApiError(413, 'attachment_too_large');
    if (attachmentPart.size < minimumAttachmentBytes) throw new ApiError(415, 'invalid_attachment');
    const bytes = new Uint8Array(await attachmentPart.arrayBuffer());
    const detected = detectImageType(bytes);
    if (!detected) throw new ApiError(415, 'invalid_attachment');
    return { payload: parseJsonObject(payloadPart), attachment: { bytes, content_type: detected } };
  }
  if (!contentType.startsWith('application/json')) throw new ApiError(415, 'unsupported_media_type');
  return { payload: parseJsonObject(await readLimitedRequestText(request, maximumJsonBytes)), attachment: null };
}

function validateSubmission(payload: Record<string, unknown>): Submission {
  const parsed = submissionSchema.safeParse(payload);
  if (!parsed.success) throw new ApiError(422, 'invalid_feedback');
  return parsed.data;
}

async function enforceRateLimits(env: Env, project: Project, installationHash: string): Promise<void> {
  const now = Date.now();
  const perInstallation = await countRecentByInstallation(
    env.DB,
    installationHash,
    new Date(now - installationWindowMs).toISOString(),
  );
  if (perInstallation >= installationLimit) throw new ApiError(429, 'rate_limited');
  const perProject = await countRecentByProject(env.DB, project.id, new Date(now - projectWindowMs).toISOString());
  if (perProject >= projectLimit) throw new ApiError(429, 'rate_limited');
}

export async function handleIngest(context: Context<{ Bindings: Env }>): Promise<Response> {
  const { env } = context;
  const request = context.req.raw;
  const project = await resolveProjectFromRequest(env, context.req.header('Authorization'));

  const installationId = context.req.header('X-Feedback-Installation-ID')?.trim().toLowerCase();
  if (!isUuid(installationId)) throw new ApiError(400, 'invalid_installation_id');
  const idempotencyKey = context.req.header('Idempotency-Key')?.trim().toLowerCase();
  if (!isUuid(idempotencyKey)) throw new ApiError(400, 'invalid_idempotency_key');

  const body = await parseBody(request);
  const submission = validateSubmission(body.payload);
  const installationHash = await sha256Hex(`feedback-installation:${installationId}`);
  await enforceRateLimits(env, project, installationHash);

  const feedbackId = crypto.randomUUID();
  const userAgent = context.req.header('User-Agent')?.slice(0, 200) ?? null;
  let attachmentRecord: { key: string; content_type: AttachmentContentType; byte_count: number; token: string } | null = null;
  if (body.attachment) {
    const key = attachmentObjectKey(project.id, feedbackId, body.attachment.content_type);
    try {
      await env.ATTACHMENTS.put(key, body.attachment.bytes, { httpMetadata: { contentType: body.attachment.content_type } });
    } catch (error) {
      writeLog('attachment.store_failed', 'error', { project_id: project.id, error: errorMessage(error) });
      throw new ApiError(503, 'feedback_unavailable');
    }
    attachmentRecord = {
      key,
      content_type: body.attachment.content_type,
      byte_count: body.attachment.bytes.byteLength,
      token: await attachmentCapabilityToken(env, feedbackId),
    };
  }

  const { row, inserted } = await insertFeedback(env.DB, {
    id: feedbackId,
    project_id: project.id,
    idempotency_key: idempotencyKey,
    submission,
    installation_hash: installationHash,
    user_agent: userAgent,
    attachment: attachmentRecord,
  });

  if (!inserted) {
    if (attachmentRecord) await env.ATTACHMENTS.delete(attachmentRecord.key).catch(() => undefined);
    const existing = await listDeliveriesForFeedback(env.DB, row.id);
    const receipt: Receipt = { feedback_id: row.id, duplicate: true, delivery_status: summarizeDeliveryStatus(existing) };
    return context.json(receipt, 202);
  }

  const destinations = (await listDestinations(env.DB, project.id)).filter((destination) =>
    destinationAccepts(destination, submission.category),
  );
  await createDeliveries(env.DB, row.id, destinations.map((destination) => destination.id));
  if (destinations.length > 0) {
    const baseUrl = publicBaseUrl(env, request);
    context.executionCtx.waitUntil(
      deliverFeedback(env, baseUrl, row.id).catch((error) =>
        writeLog('delivery.unhandled', 'error', { feedback_id: row.id, error: errorMessage(error) }),
      ),
    );
  }
  writeLog('feedback.accepted', 'info', { project_id: project.id, feedback_id: row.id, category: submission.category, attachment: Boolean(attachmentRecord) });
  const receipt: Receipt = { feedback_id: row.id, duplicate: false, delivery_status: 'accepted' };
  return context.json(receipt, 202);
}
