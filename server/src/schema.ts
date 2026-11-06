import { z } from 'zod';

const scalars = (value: string): number => [...value].length;

/** Trimmed string whose Unicode scalar count is within [min, max]. */
function scalarString(min: number, max: number) {
  return z.string().trim().refine(
    (value) => {
      const count = scalars(value);
      return count >= min && count <= max;
    },
    { message: `expected ${min}-${max} characters` },
  );
}

export const categories = ['feedback', 'bug', 'idea'] as const;
export const categorySchema = z.enum(categories);
export type Category = z.infer<typeof categorySchema>;

export const statuses = ['new', 'triaged', 'closed'] as const;
export const statusSchema = z.enum(statuses);
export type Status = z.infer<typeof statusSchema>;

export const accountStatusSchema = z.enum(['unknown', 'free', 'paid']);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

const emailSchema = z.string().trim().refine(
  (value) => scalars(value) <= 254 && !/\s/.test(value) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
  { message: 'invalid email' },
);

export const contextSchema = z.strictObject({
  app_version: scalarString(1, 40),
  build_number: scalarString(1, 40),
  os_version: scalarString(1, 80),
  locale: scalarString(2, 80),
  device_family: scalarString(1, 80),
  device_model: scalarString(1, 80).nullable().optional(),
});

export const userSchema = z.strictObject({
  id: scalarString(1, 200).nullable().optional(),
  account_status: accountStatusSchema.default('unknown'),
  plan: scalarString(1, 200).nullable().optional(),
  entitlements: z.array(scalarString(1, 200)).max(20).default([]),
  attributes: z
    .record(z.string().refine((key) => scalars(key) >= 1 && scalars(key) <= 80), z.string().refine((value) => scalars(value) <= 500))
    .refine((attributes) => Object.keys(attributes).length <= 20, { message: 'too many attributes' })
    .default({}),
});

export const anonymousUser: z.infer<typeof userSchema> = {
  id: null,
  account_status: 'unknown',
  plan: null,
  entitlements: [],
  attributes: {},
};

export const submissionSchema = z.strictObject({
  schema_version: z.literal(1),
  category: categorySchema,
  message: scalarString(4, 2000),
  name: scalarString(1, 120).nullable().optional(),
  reply_email: emailSchema.nullable().optional(),
  context: contextSchema,
  user: userSchema.default(anonymousUser),
});
export type Submission = z.infer<typeof submissionSchema>;

export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,39}$/);

export const createProjectSchema = z.strictObject({
  name: scalarString(1, 80),
  slug: slugSchema.optional(),
  bundle_id: scalarString(1, 120).nullable().optional(),
  retention_days: z.number().int().min(1).max(365).default(30),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export const patchProjectSchema = z.strictObject({
  name: scalarString(1, 80).optional(),
  bundle_id: scalarString(1, 120).nullable().optional(),
  retention_days: z.number().int().min(1).max(365).optional(),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  icon_url: z.string().url().max(2_048).refine((value) => value.startsWith('https://'), 'https only').nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'empty patch' });

export const destinationKindSchema = z.enum(['slack_webhook', 'webhook', 'email']);
export type DestinationKind = z.infer<typeof destinationKindSchema>;

const destinationUrlSchema = z.string().trim().max(2048).refine((value) => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}, { message: 'https url required' });

const emailAddressSchema = z.string().trim().toLowerCase().email().max(254);

/** `url` carries the https endpoint for webhooks and the recipient address for email. */
export const createDestinationSchema = z.strictObject({
  kind: destinationKindSchema,
  url: z.string().trim().max(2048),
  secret: scalarString(8, 200).nullable().optional(),
  categories: z.array(categorySchema).max(3).default([]),
}).superRefine((value, context) => {
  if (value.kind === 'email') {
    const parsed = emailAddressSchema.safeParse(value.url);
    if (!parsed.success) context.addIssue({ code: 'custom', message: 'email address required', path: ['url'] });
  } else if (!destinationUrlSchema.safeParse(value.url).success) {
    context.addIssue({ code: 'custom', message: 'https url required', path: ['url'] });
  }
  if (value.kind === 'webhook' && !value.secret) {
    context.addIssue({ code: 'custom', message: 'webhook destinations require a secret', path: ['secret'] });
  }
}).transform((value) => (value.kind === 'email' ? { ...value, url: value.url.trim().toLowerCase() } : value));

export const patchDestinationSchema = z.strictObject({
  enabled: z.boolean().optional(),
  url: destinationUrlSchema.optional(),
  secret: scalarString(8, 200).nullable().optional(),
  categories: z.array(categorySchema).max(3).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'empty patch' });

export const patchFeedbackSchema = z.strictObject({
  status: statusSchema.optional(),
  internal_note: z.string().refine((value) => scalars(value) <= 4000).nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'empty patch' });

export const listFeedbackQuerySchema = z.object({
  status: statusSchema.optional(),
  category: categorySchema.optional(),
  app_version: z.string().trim().max(40).optional(),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});
export type ListFeedbackQuery = z.infer<typeof listFeedbackQuerySchema>;

/** Converts an empty string from an HTML form into undefined. */
export function blankToUndefined(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
