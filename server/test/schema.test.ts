import { describe, expect, it } from 'vitest';

import fullSubmission from '../../contracts/fixtures/full-submission.json';
import minimumSubmission from '../../contracts/fixtures/minimum-valid-submission.json';
import { submissionSchema } from '../src/schema';

const fixtures: Record<string, unknown> = {
  'minimum-valid-submission.json': minimumSubmission,
  'full-submission.json': fullSubmission,
};
const fixture = (name: string): unknown => structuredClone(fixtures[name]);

describe('submission schema against the shared contract fixtures', () => {
  it('accepts the minimum fixture and defaults the user', () => {
    const parsed = submissionSchema.parse(fixture('minimum-valid-submission.json'));
    expect(parsed.user).toEqual({ id: null, account_status: 'unknown', plan: null, entitlements: [], attributes: {} });
    expect(parsed.name).toBeUndefined();
  });

  it('accepts the full fixture', () => {
    const parsed = submissionSchema.parse(fixture('full-submission.json'));
    expect(parsed.user.account_status).toBe('paid');
    expect(parsed.context.device_model).toBe('iPhone17,1');
    expect(parsed.user.attributes).toEqual({ theme: 'dark', onboarding: 'complete' });
  });

  it('rejects unknown keys, short messages, bad emails and oversized attributes', () => {
    const base = fixture('minimum-valid-submission.json') as Record<string, unknown>;
    expect(submissionSchema.safeParse({ ...base, extra: true }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, message: '🐛🐛🐛' }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, message: '🐛🐛🐛🐛' }).success).toBe(true);
    expect(submissionSchema.safeParse({ ...base, message: 'x'.repeat(2001) }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, reply_email: 'nope' }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, reply_email: 'a b@c.d' }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, reply_email: 'ok@example.com' }).success).toBe(true);
    const attributes = Object.fromEntries(Array.from({ length: 21 }, (_, index) => [`k${index}`, 'v']));
    expect(submissionSchema.safeParse({ ...base, user: { attributes } }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, user: { attributes: { k: 'x'.repeat(501) } } }).success).toBe(false);
    expect(submissionSchema.safeParse({ ...base, context: { ...(base.context as object), locale: 'x' } }).success).toBe(false);
  });
});
