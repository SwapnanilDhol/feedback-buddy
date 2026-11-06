import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { adminHeaders, call, callJson, createProject, fakeJpeg, fakePng, ingestHeaders, multipart, submit, submitMultipart, validSubmission } from './helpers';

describe('POST /v1/feedback', () => {
  it('rejects missing, malformed and unknown keys with 401', async () => {
    const project = await createProject();
    expect((await submit('fb_pub_000000000000000000000000')).status).toBe(401);
    expect((await submit('not-a-key')).status).toBe(401);
    const { status, body } = await callJson<{ error: string }>('/v1/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Feedback-Installation-ID': crypto.randomUUID(), 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(validSubmission),
    });
    expect(status).toBe(401);
    expect(body.error).toBe('invalid_api_key');
    expect(project.public_key.startsWith('fb_pub_')).toBe(true);
  });

  it('validates the identity headers', async () => {
    const project = await createProject();
    const badInstall = await submit(project.public_key, validSubmission, { 'X-Feedback-Installation-ID': 'nope' });
    expect(badInstall.status).toBe(400);
    expect(badInstall.body.error).toBe('invalid_installation_id');
    const badKey = await submit(project.public_key, validSubmission, { 'Idempotency-Key': '123' });
    expect(badKey.status).toBe(400);
    expect(badKey.body.error).toBe('invalid_idempotency_key');
  });

  it('accepts JSON, stores it, and is idempotent per key', async () => {
    const project = await createProject();
    const idempotencyKey = crypto.randomUUID();
    const first = await submit(project.public_key, validSubmission, { 'Idempotency-Key': idempotencyKey });
    expect(first.status).toBe(202);
    expect(first.body.duplicate).toBe(false);
    expect(first.body.delivery_status).toBe('accepted');
    const second = await submit(project.public_key, validSubmission, { 'Idempotency-Key': idempotencyKey });
    expect(second.status).toBe(202);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.feedback_id).toBe(first.body.feedback_id);

    const stored = await callJson<{ feedback: { message: string; status: string; context: { device_model: string | null }; user: { account_status: string } } }>(
      `/api/v1/feedback/${first.body.feedback_id}`,
      { headers: adminHeaders },
    );
    expect(stored.status).toBe(200);
    expect(stored.body.feedback.message).toBe(validSubmission.message);
    expect(stored.body.feedback.status).toBe('todo');
    expect(stored.body.feedback.context.device_model).toBeNull();
    expect(stored.body.feedback.user.account_status).toBe('unknown');

    const row = await env.DB.prepare('SELECT installation_hash FROM feedback WHERE id = ?1').bind(first.body.feedback_id).first<{ installation_hash: string }>();
    expect(row?.installation_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects malformed bodies and media types', async () => {
    const project = await createProject();
    const unknownField = await submit(project.public_key, { ...validSubmission, surprise: 1 });
    expect(unknownField.status).toBe(422);
    expect(unknownField.body.error).toBe('invalid_feedback');
    const invalidJson = await callJson<{ error: string }>('/v1/feedback', { method: 'POST', headers: ingestHeaders(project.public_key), body: '{nope' });
    expect(invalidJson.status).toBe(422);
    expect(invalidJson.body.error).toBe('invalid_json');
    const wrongType = await callJson<{ error: string }>('/v1/feedback', {
      method: 'POST',
      headers: ingestHeaders(project.public_key, { 'Content-Type': 'text/plain' }),
      body: 'hello',
    });
    expect(wrongType.status).toBe(415);
    expect(wrongType.body.error).toBe('unsupported_media_type');
    const tooLarge = await submit(project.public_key, { ...validSubmission, message: 'x'.repeat(20_000) });
    expect(tooLarge.status).toBe(413);
    expect(tooLarge.body.error).toBe('payload_too_large');
  });

  it('stores JPEG and PNG attachments in R2 and exposes them through the admin API', async () => {
    const project = await createProject();
    const jpeg = await submitMultipart(project.public_key, multipart(validSubmission, fakeJpeg(1024)));
    expect(jpeg.status).toBe(202);
    const detail = await callJson<{ feedback: { attachment: { content_type: string; byte_count: number; url: string } | null } }>(
      `/api/v1/feedback/${jpeg.body.feedback_id}`,
      { headers: adminHeaders },
    );
    expect(detail.body.feedback.attachment).toEqual({
      content_type: 'image/jpeg',
      byte_count: 1024,
      url: `/api/v1/feedback/${jpeg.body.feedback_id}/attachment`,
    });
    const object = await env.ATTACHMENTS.get(`projects/${project.id}/${jpeg.body.feedback_id}.jpg`);
    expect(object?.size).toBe(1024);

    const image = await call(`/api/v1/feedback/${jpeg.body.feedback_id}/attachment`, { headers: adminHeaders });
    expect(image.status).toBe(200);
    expect(image.headers.get('Content-Type')).toBe('image/jpeg');
    expect((await image.arrayBuffer()).byteLength).toBe(1024);

    const png = await submitMultipart(project.public_key, multipart(validSubmission, fakePng(512), 'image/png'), {
      'X-Feedback-Installation-ID': crypto.randomUUID(),
    });
    expect(png.status).toBe(202);
    expect(await env.ATTACHMENTS.head(`projects/${project.id}/${png.body.feedback_id}.png`)).not.toBeNull();

    const row = await env.DB.prepare('SELECT attachment_token FROM feedback WHERE id = ?1').bind(jpeg.body.feedback_id).first<{ attachment_token: string }>();
    const capability = await call(`/v1/attachments/${row?.attachment_token}`);
    expect(capability.status).toBe(200);
    expect((await call('/v1/attachments/' + 'a'.repeat(64))).status).toBe(404);
  });

  it('rejects bad, oversized and malformed attachments', async () => {
    const project = await createProject();
    const notImage = await submitMultipart(project.public_key, multipart(validSubmission, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9])));
    expect(notImage.status).toBe(415);
    expect(notImage.body.error).toBe('invalid_attachment');
    const oversize = await submitMultipart(project.public_key, multipart(validSubmission, fakeJpeg(1_500_001)));
    expect(oversize.status).toBe(413);
    expect(oversize.body.error).toBe('attachment_too_large');
    const form = new FormData();
    form.set('payload', JSON.stringify(validSubmission));
    const missing = await submitMultipart(project.public_key, form);
    expect(missing.status).toBe(422);
    expect(missing.body.error).toBe('invalid_multipart');
    const badPayload = await submitMultipart(project.public_key, multipart({ ...validSubmission, extra: 1 }, fakeJpeg()));
    expect(badPayload.status).toBe(422);
    expect((await env.ATTACHMENTS.list({ prefix: `projects/${project.id}/` })).objects).toHaveLength(0);
  });

  it('rate limits the sixth submission from one installation inside ten minutes', async () => {
    const project = await createProject();
    const installation = crypto.randomUUID();
    for (let index = 0; index < 5; index += 1) {
      const response = await submit(project.public_key, validSubmission, { 'X-Feedback-Installation-ID': installation });
      expect(response.status).toBe(202);
    }
    const limited = await submit(project.public_key, validSubmission, { 'X-Feedback-Installation-ID': installation });
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe('rate_limited');
    const other = await submit(project.public_key, validSubmission, { 'X-Feedback-Installation-ID': crypto.randomUUID() });
    expect(other.status).toBe(202);
  });
});
