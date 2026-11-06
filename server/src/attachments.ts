import { ApiError } from './http';
import { clearAttachment, listExpiredAttachments, readFeedbackByAttachmentToken, type FeedbackRow } from './repository';
import { sha256Hex } from './security';
import { errorMessage, writeLog } from './log';

export const maximumAttachmentBytes = 1_500_000;
export const minimumAttachmentBytes = 4;

export type AttachmentContentType = 'image/jpeg' | 'image/png';

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Detects the image type from magic bytes; returns null for anything else. */
export function detectImageType(bytes: Uint8Array): AttachmentContentType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= pngSignature.length && pngSignature.every((byte, index) => bytes[index] === byte)) return 'image/png';
  return null;
}

export function attachmentObjectKey(projectId: string, feedbackId: string, contentType: AttachmentContentType): string {
  return `projects/${projectId}/${feedbackId}.${contentType === 'image/png' ? 'png' : 'jpg'}`;
}

/** Unguessable, deterministic capability token bound to one feedback record. */
export function attachmentCapabilityToken(env: Env, feedbackId: string): Promise<string> {
  return sha256Hex(`attachment:${env.SESSION_SECRET}:${feedbackId}`);
}

export function capabilityUrl(baseUrl: string, row: FeedbackRow): string {
  return `${baseUrl}/v1/attachments/${row.attachment_token ?? ''}`;
}

export function adminAttachmentUrl(row: FeedbackRow): string {
  return `/api/v1/feedback/${row.id}/attachment`;
}

export async function streamAttachment(env: Env, row: FeedbackRow): Promise<Response> {
  if (!row.attachment_key || !row.attachment_content_type) throw new ApiError(404, 'not_found');
  const object = await env.ATTACHMENTS.get(row.attachment_key);
  if (!object) throw new ApiError(404, 'not_found');
  return new Response(object.body, {
    headers: {
      'Content-Type': row.attachment_content_type,
      'Content-Length': String(object.size),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function serveAttachmentByToken(env: Env, token: string): Promise<Response> {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(404, 'not_found');
  const row = await readFeedbackByAttachmentToken(env.DB, token);
  if (!row) throw new ApiError(404, 'not_found');
  return streamAttachment(env, row);
}

/** Deletes attachments older than their project's retention window. */
export async function enforceRetention(env: Env): Promise<number> {
  const expired = await listExpiredAttachments(env.DB);
  let removed = 0;
  for (const item of expired) {
    try {
      await env.ATTACHMENTS.delete(item.attachment_key);
      await clearAttachment(env.DB, item.id);
      removed += 1;
    } catch (error) {
      writeLog('attachment.retention_failed', 'warn', { feedback_id: item.id, error: errorMessage(error) });
    }
  }
  return removed;
}
