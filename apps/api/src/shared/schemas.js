/**
 * Zod schemas for request validation.
 */

import { z } from 'zod';
import {
  ROLES,
  CLIENT_STATUS,
  CLIENT_SOURCE,
  PROJECT_STATUS,
  INQUIRY_STATUS,
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  PAYMENT_METHOD,
  INVOICE_STATUS,
  EMPLOYMENT_STATUS,
  SHAREHOLDER_STATUS,
  SHARE_CLASS,
  TASK_STATUS,
  TASK_PRIORITY,
  DELIVERABLE_TYPE,
  METRIC_PLATFORM,
  METRIC_SOURCE,
  CONTENT_STAGE,
  PROPOSAL_STATUS,
  valuesOf,
} from './enums.js';

/** Trimmed, non-empty string with a bounded length. */
const trimmed = (max) =>
  z
    .string()
    .trim()
    .min(1, 'Required')
    .max(max, `Must be ${max} characters or fewer`);

/** Optional string that normalises '' to undefined instead of storing empty text. */
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v))
    .nullable()
    .optional();

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only');

/**
 * Build an update schema out of a create schema.
 *
 * `z.object(...).partial()` in Zod 4 does NOT drop an inner `.default()`, so the
 * parsed output still carries the defaults for every key the caller left out.
 * The API writes that parsed body straight onto the row, so a request that sent
 * only `{ status }` would silently reset the task's priority to "medium" and a
 * request that sent nothing would reset it to "todo".
 *
 * Stripping the defaults first and making every key optional means an update
 * only ever touches the fields it actually names.
 */
const partialUpdate = (schema, message = 'Provide at least one field to update') => {
  const shape = {};

  for (const [key, value] of Object.entries(schema.shape)) {
    const base = value instanceof z.ZodDefault ? value.removeDefault() : value;
    shape[key] = base.optional();
  }

  return z.object(shape).refine((value) => Object.keys(value).length > 0, message);
};

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(191);

/**
 * Money arrives as a string or number from forms. We validate the *shape* here and
 * convert to integer minor units in the API so no float arithmetic ever occurs.
 */
export const moneyInputSchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .refine((v) => /^\d{1,12}(\.\d{1,2})?$/.test(v), 'Enter a valid amount with up to 2 decimal places')
  .refine((v) => Number(v) > 0, 'Amount must be greater than zero')
  .refine((v) => Number(v) <= 9_999_999_999.99, 'Amount is too large');

const idSchema = z.coerce.number().int().positive();

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Use a hex colour such as #025298');

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .or(z.string().trim().regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/, 'Invalid date'));

export const WEAK_PASSWORDS = [
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  'qwerty123',
  'letmein',
  'admin123',
  'welcome1',
  'iloveyou',
  'abc12345',
  'changeme',
];

/** Rejects blank, short, or commonly-breached passwords. */
export const passwordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(200, 'Password is too long')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), {
    message: 'Include at least one lowercase letter, one uppercase letter and one number',
  })
  .refine((v) => !WEAK_PASSWORDS.includes(v.toLowerCase()), {
    message: 'That password is too common. Choose something less predictable.',
  });

/* -------------------------------------------------------------------------- */
/* Pagination & sorting                                                        */
/* -------------------------------------------------------------------------- */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(191).optional(),
  sort: z.string().trim().max(64).optional(),
  order: z.enum(['ASC', 'DESC']).default('DESC'),
});

export const makeListQuerySchema = (allowedSorts) =>
  paginationQuerySchema.extend({
    sort: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || allowedSorts.includes(v), {
        message: `Sort must be one of: ${allowedSorts.join(', ')}`,
      }),
  });

/* -------------------------------------------------------------------------- */
/* Auth                                                                       */
/* -------------------------------------------------------------------------- */

/*
 * Sign-in. The `identifier` field is the new, generic one: it can hold an
 * email address, a username or a phone number, and the server works out which.
 * `email` is still accepted so an older client that posts it keeps working —
 * the route prefers `identifier` and falls back to `email`.
 */
export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Enter your email, username or phone').max(191).optional(),
  email: emailSchema.optional(),
  password: z.string().min(1, 'Password is required').max(200),
}).refine((v) => v.identifier || v.email, 'Enter your email, username or phone');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: passwordSchema,
});

/*
 * Self-service update of the handles a person signs in with.
 *
 * All three are optional: a field that is absent means "leave it alone", and
 * an empty string means "clear it". At least one must remain, which the
 * service enforces once it knows which fields were actually sent.
 */
export const sendNotificationSchema = z.object({
  userId: idSchema,
  title: trimmed(120).default('Virallink'),
  body: z.string().trim().min(1, 'Message body is required').max(2000),
});

export const changeHandlesSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(191).nullable().optional(),
  username: z.string().trim().toLowerCase().max(64).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
});

/**
 * Password recovery.
 *
 * The code is six digits, delivered over Telegram. It is short enough to read
 * off a phone screen and type into a browser, which is why the service — not
 * this schema — caps how many times a code may be tried and how often one may
 * be sent.
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from Telegram'),
  newPassword: passwordSchema,
});

/**
 * An administrator setting somebody else's password.
 *
 * `password` is optional: omit it and the API generates a strong temporary one
 * and returns it, which is safer than an administrator picking "password123"
 * while handing credentials over a phone call.
 *
 * `mustChangePassword` forces the holder to choose their own at the next
 * sign-in, which is what makes it safe to hand a temporary password out.
 */
export const resetUserPasswordSchema = z.object({
  password: passwordSchema.optional(),
  mustChangePassword: z.boolean().default(true),
});

export const createUserSchema = z.object({
  name: trimmed(120),
  email: emailSchema.optional(),
  username: z.string().trim().toLowerCase().max(64).optional(),
  phone: z.string().trim().max(60).optional(),
  password: passwordSchema,
  role: z.enum(valuesOf(ROLES)),
  isActive: z.boolean().default(true),
  employeeId: idSchema.nullable().optional(),
}).refine(
  (v) => v.email || v.username || v.phone,
  'An account needs at least one of email, username or phone',
);

export const updateUserSchema = z
  .object({
    name: trimmed(120).optional(),
    email: emailSchema.optional(),
    username: z.string().trim().toLowerCase().max(64).nullable().optional(),
    phone: z.string().trim().max(60).nullable().optional(),
    password: passwordSchema.optional(),
    /** Force the holder to choose a password of their own at the next sign-in. */
    mustChangePassword: z.boolean().optional(),
    /**
     * The person's Telegram username, without the @. Registering it is what
     * lets them recover their password over Telegram before they have linked
     * an account: the bot sends a reset code only to a chat whose username
     * matches this one.
     */
    telegramUsername: z.string().trim().max(64).optional(),
    /**
     * The person's Telegram chat id. Setting it means the bot can deliver to
     * them directly, which is what a password-reset code needs. `null` unlinks
     * it.
     */
    telegramChatId: z.coerce.number().int().positive().nullable().optional(),
    role: z.enum(valuesOf(ROLES)).optional(),
    isActive: z.boolean().optional(),
    employeeId: idSchema.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field to update');

/* -------------------------------------------------------------------------- */
/* Company profile                                                            */
/* -------------------------------------------------------------------------- */

export const upsertCompanySchema = z.object({
  name: trimmed(191),
  legalName: optionalText(191),
  shortDescription: optionalText(500),
  description: optionalText(8000),
  mission: optionalText(2000),
  vision: optionalText(2000),
  values: optionalText(4000),
  foundedDate: isoDateSchema.optional(),
  registrationNumber: optionalText(120),
  taxIdentifier: optionalText(120),
  addressLine1: optionalText(191),
  addressLine2: optionalText(191),
  city: optionalText(120),
  region: optionalText(120),
  country: optionalText(120),
  postalCode: optionalText(32),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  phone: optionalText(60),
  secondaryPhone: optionalText(60),
  email: emailSchema.optional().nullable(),
  website: z.string().trim().url().optional().or(z.literal('')).nullable(),
  logoMediaId: idSchema.optional().nullable(),
  faviconMediaId: idSchema.optional().nullable(),
  openingHours: optionalText(500),
  metaTitle: optionalText(191),
  metaDescription: optionalText(400),
});

/* -------------------------------------------------------------------------- */
/* Employees                                                                  */
/* -------------------------------------------------------------------------- */

export const upsertEmployeeSchema = z.object({
  name: trimmed(160),
  position: optionalText(160),
  departmentId: idSchema.optional().nullable(),
  biography: optionalText(6000),
  photoMediaId: idSchema.optional().nullable(),
  email: emailSchema.optional().nullable(),
  phone: optionalText(60),
  linkedinUrl: z.string().trim().url().optional().or(z.literal('')).nullable(),
  employmentStatus: z.enum(valuesOf(EMPLOYMENT_STATUS)).default(EMPLOYMENT_STATUS.ACTIVE),
  joinedAt: isoDateSchema.optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isPublic: z.boolean().default(false),
});

/**
 * An employee edit only touches the fields it names.
 *
 * Reusing the create schema here defaulted `isPublic` to false, so a request
 * that sent only a new job title silently took the person off the public team
 * page — and one that sent only `isPublic` had to repeat every other field.
 */
export const updateEmployeeSchema = z
  .object({
    name: trimmed(160).optional(),
    position: optionalText(160),
    departmentId: idSchema.optional().nullable(),
    biography: optionalText(6000),
    photoMediaId: idSchema.optional().nullable(),
    email: emailSchema.optional().nullable(),
    phone: optionalText(60),
    linkedinUrl: z.string().trim().url().optional().or(z.literal('')).nullable(),
    employmentStatus: z.enum(valuesOf(EMPLOYMENT_STATUS)).optional(),
    joinedAt: isoDateSchema.optional().nullable(),
    displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/* -------------------------------------------------------------------------- */
/* Shareholders                                                               */
/* -------------------------------------------------------------------------- */

export const upsertShareholderSchema = z.object({
  name: trimmed(160),
  shareClass: z.enum(valuesOf(SHARE_CLASS)).default(SHARE_CLASS.ORDINARY),
  shareCount: z.coerce.number().int().min(0).max(100000000).default(0),
  ownershipPercentage: z.coerce.number().min(0).max(100).default(0),
  joinedAt: isoDateSchema.optional().nullable(),
  status: z.enum(valuesOf(SHAREHOLDER_STATUS)).default(SHAREHOLDER_STATUS.ACTIVE),
  notes: optionalText(4000),
  parentId: idSchema.optional().nullable(),
});

/**
 * A shareholder edit only touches the fields it names.
 *
 * Reusing the create schema reset `shareCount`, `ownershipPercentage` and
 * `status` on every save, so editing a name wiped the shareholding.
 */
export const updateShareholderSchema = z
  .object({
    name: trimmed(160).optional(),
    shareClass: z.enum(valuesOf(SHARE_CLASS)).optional(),
    shareCount: z.coerce.number().int().min(0).max(100000000).optional(),
    ownershipPercentage: z.coerce.number().min(0).max(100).optional(),
    joinedAt: isoDateSchema.optional().nullable(),
    status: z.enum(valuesOf(SHAREHOLDER_STATUS)).optional(),
    notes: optionalText(4000),
    parentId: idSchema.optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

export const upsertClientSchema = z.object({
  name: trimmed(191),
  contactPerson: optionalText(160),
  email: emailSchema.optional().nullable(),
  phone: optionalText(60),
  website: z.string().trim().url().optional().or(z.literal('')).nullable(),
  industry: optionalText(120),
  addressLine1: optionalText(191),
  city: optionalText(120),
  country: optionalText(120),
  status: z.enum(valuesOf(CLIENT_STATUS)).default(CLIENT_STATUS.PROSPECT),
  source: z.enum(valuesOf(CLIENT_SOURCE)).optional().nullable(),
  notes: optionalText(4000),
  logoMediaId: idSchema.optional().nullable(),
  isPublic: z.boolean().default(false),
  contractValue: moneyInputSchema.optional().nullable(),
});

/**
 * A client edit only touches the fields it names.
 *
 * The create schema defaults `status` to `prospect` and `isPublic` to false,
 * so an edit that changed only the phone number quietly reset the client's
 * status and took it off the public clients page.
 */
export const updateClientSchema = z
  .object({
    name: trimmed(191).optional(),
    contactPerson: optionalText(160),
    email: emailSchema.optional().nullable(),
    phone: optionalText(60),
    website: z.string().trim().url().optional().or(z.literal('')).nullable(),
    industry: optionalText(120),
    addressLine1: optionalText(191),
    city: optionalText(120),
    country: optionalText(120),
    status: z.enum(valuesOf(CLIENT_STATUS)).optional(),
    source: z.enum(valuesOf(CLIENT_SOURCE)).optional().nullable(),
    notes: optionalText(4000),
    logoMediaId: idSchema.optional().nullable(),
    isPublic: z.boolean().optional(),
    contractValue: moneyInputSchema.optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const clientNoteSchema = z.object({
  body: trimmed(4000),
});

/* -------------------------------------------------------------------------- */
/* First-run setup                                                            */
/* -------------------------------------------------------------------------- */

export const setupAdminSchema = z.object({
  name: trimmed(120),
  identifier: z.string().trim().min(1, 'Enter your email, username or phone').max(191).optional(),
  email: emailSchema.optional(),
  password: passwordSchema,
}).refine((v) => v.identifier || v.email, 'Enter your email, username or phone');

/* -------------------------------------------------------------------------- */
/* Client reporting                                                           */
/* -------------------------------------------------------------------------- */

const monthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM');

export const upsertDeliverableSchema = z.object({
  clientId: idSchema,
  title: trimmed(191),
  type: z.enum(valuesOf(DELIVERABLE_TYPE)).default(DELIVERABLE_TYPE.VIDEO),
  platform: z.enum(valuesOf(METRIC_PLATFORM)).default(METRIC_PLATFORM.OTHER),
  url: z.string().trim().url().optional().or(z.literal('')).nullable(),
  publishedAt: z.coerce.date().optional().nullable(),
  mediaId: idSchema.optional().nullable(),
  notes: optionalText(2000),
  stage: z.enum(valuesOf(CONTENT_STAGE)).optional(),
  shootDate: z.union([z.coerce.date(), z.literal('')]).nullable().optional(),
  scheduledFor: z.union([z.coerce.date(), z.literal('')]).nullable().optional(),
  assigneeId: z.coerce.number().int().positive().nullable().optional(),
  idea: optionalText(4000),
  brainstormNotes: optionalText(4000),
  scriptBody: optionalText(8000),
});

export const updateDeliverableSchema = partialUpdate(upsertDeliverableSchema);

export const upsertMetricSchema = z.object({
  deliverableId: idSchema,
  month: monthSchema,
  platform: z.enum(valuesOf(METRIC_PLATFORM)).default(METRIC_PLATFORM.OTHER),
  views: z.coerce.number().int().min(0).optional().nullable(),
  likes: z.coerce.number().int().min(0).optional().nullable(),
  comments: z.coerce.number().int().min(0).optional().nullable(),
  shares: z.coerce.number().int().min(0).optional().nullable(),
  watchHours: z.coerce.number().min(0).optional().nullable(),
  source: z.enum(valuesOf(METRIC_SOURCE)).default(METRIC_SOURCE.MANUAL),
});

export const updateMetricSchema = partialUpdate(upsertMetricSchema);

export const listDeliverablesQuerySchema = paginationQuerySchema.extend({
  month: monthSchema.optional(),
  type: z.enum(valuesOf(DELIVERABLE_TYPE)).optional(),
  platform: z.enum(valuesOf(METRIC_PLATFORM)).optional(),
  // Without this key Zod strips `clientId` from the query, so the service never
  // sees it and the client detail page would show every client's content.
  clientId: z.coerce.number().int().positive().optional(),
});

export const reportQuerySchema = z.object({
  month: monthSchema.optional(),
  months: z.coerce.number().int().min(1).max(12).default(6),
});

/* -------------------------------------------------------------------------- */
/* Content production pipeline                                                 */
/* -------------------------------------------------------------------------- */

export const updateContentItemSchema = z
  .object({
    title: trimmed(191).optional(),
    type: z.enum(valuesOf(DELIVERABLE_TYPE)).optional(),
    platform: z.enum(valuesOf(METRIC_PLATFORM)).optional(),
    url: z.string().trim().url().optional().or(z.literal('')).nullable(),
    stage: z.enum(valuesOf(CONTENT_STAGE)).optional(),
    shootDate: z.union([z.coerce.date(), z.literal('')]).nullable().optional(),
    scheduledFor: z.union([z.coerce.date(), z.literal('')]).nullable().optional(),
    publishedAt: z.union([z.coerce.date(), z.literal('')]).nullable().optional(),
    assigneeId: z.coerce.number().int().positive().nullable().optional(),
    revisionCount: z.coerce.number().int().min(0).nullable().optional(),
    idea: optionalText(4000),
    brainstormNotes: optionalText(4000),
    scriptBody: optionalText(8000),
    approvalNotes: optionalText(4000),
    notes: optionalText(4000),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const moveStageSchema = z
  .object({
    stage: z.enum(valuesOf(CONTENT_STAGE)),
    note: optionalText(2000),
    sentForApproval: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.stage === CONTENT_STAGE.REVISION && !value.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'Say what needs changing — a rejection without a reason cannot be acted on',
      });
    }
  });

export const upsertProposalSchema = z.object({
  clientId: idSchema,
  title: trimmed(191),
  summary: optionalText(4000),
  scope: optionalText(2000),
  status: z.enum(valuesOf(PROPOSAL_STATUS)).default(PROPOSAL_STATUS.DRAFT),
  value: moneyInputSchema.optional().nullable(),
  proposedStart: z.union([z.coerce.date(), z.literal('')]).nullable().optional(),
});

export const updateProposalSchema = partialUpdate(upsertProposalSchema);

export const weeklyReportQuerySchema = z.object({
  week: z.string().trim().optional(),
  clientId: z.coerce.number().int().positive().optional(),
});

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

export const upsertServiceSchema = z.object({
  title: trimmed(191),
  slug: slugSchema.optional(),
  summary: optionalText(500),
  description: optionalText(12000),
  icon: optionalText(60),
  imageMediaId: idSchema.optional().nullable(),
  parentId: idSchema.optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isPublished: z.boolean().default(false),
  metaTitle: optionalText(191),
  metaDescription: optionalText(400),
  faq: z
    .array(z.object({ question: trimmed(300), answer: trimmed(2000) }))
    .max(20)
    .default([]),
});

/**
 * A service edit only touches the fields it names.
 *
 * Reusing the create schema defaulted `isPublished` to false, so any edit to a
 * live service un-published it, and defaulted `faq` to an empty list, so every
 * edit wiped the questions and answers.
 */
export const updateServiceSchema = z
  .object({
    title: trimmed(191).optional(),
    slug: slugSchema.optional(),
    summary: optionalText(500),
    description: optionalText(12000),
    icon: optionalText(60),
    imageMediaId: idSchema.optional().nullable(),
    parentId: idSchema.optional().nullable(),
    displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
    isPublished: z.boolean().optional(),
    metaTitle: optionalText(191),
    metaDescription: optionalText(400),
    faq: z
      .array(z.object({ question: trimmed(300), answer: trimmed(2000) }))
      .max(20)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/* -------------------------------------------------------------------------- */
/* Portfolio / projects                                                       */
/* -------------------------------------------------------------------------- */

export const upsertProjectSchema = z.object({
  title: trimmed(191),
  slug: slugSchema.optional(),
  clientId: idSchema.optional().nullable(),
  serviceId: idSchema.optional().nullable(),
  summary: optionalText(500),
  description: optionalText(12000),
  challenge: optionalText(6000),
  solution: optionalText(6000),
  results: optionalText(6000),
  technologies: z.array(trimmed(80)).max(30).default([]),
  projectUrl: z.string().trim().url().optional().or(z.literal('')).nullable(),
  coverMediaId: idSchema.optional().nullable(),
  status: z.enum(valuesOf(PROJECT_STATUS)).default(PROJECT_STATUS.IN_PROGRESS),
  isFeatured: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  publishedAt: isoDateSchema.optional().nullable(),
  startedAt: isoDateSchema.optional().nullable(),
  completedAt: isoDateSchema.optional().nullable(),
  deadlineAt: isoDateSchema.optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).max(100000).default(0),
  metaTitle: optionalText(191),
  metaDescription: optionalText(400),
  images: z
    .array(
      z.object({
        mediaId: idSchema,
        caption: optionalText(300),
        displayOrder: z.coerce.number().int().min(0).max(100000).default(0),
      }),
    )
    .max(30)
    .default([]),
});

/**
 * A project edit only touches the fields it names.
 *
 * Reusing the create schema defaulted `isPublished` and `isFeatured` to false
 * and `images` to an empty list, so editing a live case study took it off the
 * site and deleted its images.
 */
export const updateProjectSchema = z
  .object({
    title: trimmed(191).optional(),
    slug: slugSchema.optional(),
    clientId: idSchema.optional().nullable(),
    serviceId: idSchema.optional().nullable(),
    summary: optionalText(500),
    description: optionalText(12000),
    challenge: optionalText(6000),
    solution: optionalText(6000),
    results: optionalText(6000),
    technologies: z.array(trimmed(80)).max(30).optional(),
    projectUrl: z.string().trim().url().optional().or(z.literal('')).nullable(),
    coverMediaId: idSchema.optional().nullable(),
    status: z.enum(valuesOf(PROJECT_STATUS)).optional(),
    isFeatured: z.boolean().optional(),
    isPublished: z.boolean().optional(),
    publishedAt: isoDateSchema.optional().nullable(),
    startedAt: isoDateSchema.optional().nullable(),
    completedAt: isoDateSchema.optional().nullable(),
    deadlineAt: isoDateSchema.optional().nullable(),
    displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
    metaTitle: optionalText(191),
    metaDescription: optionalText(400),
    images: z
      .array(
        z.object({
          mediaId: idSchema,
          caption: optionalText(300),
          displayOrder: z.coerce.number().int().min(0).max(100000).default(0),
        }),
      )
      .max(30)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/* -------------------------------------------------------------------------- */
/* Finance                                                                    */
/* -------------------------------------------------------------------------- */

export const upsertTransactionSchema = z.object({
  type: z.enum(valuesOf(TRANSACTION_TYPE)),
  amount: moneyInputSchema,
  currency: z.string().trim().length(3).toUpperCase().default('ETB'),
  categoryId: idSchema.optional().nullable(),
  clientId: idSchema.optional().nullable(),
  projectId: idSchema.optional().nullable(),
  description: trimmed(500),
  transactionDate: isoDateSchema,
  paymentMethod: z.enum(valuesOf(PAYMENT_METHOD)).optional().nullable(),
  reference: optionalText(120),
  status: z.enum(valuesOf(TRANSACTION_STATUS)).default(TRANSACTION_STATUS.COMPLETED),
  notes: optionalText(2000),
});

export const upsertInvoiceSchema = z.object({
  clientId: idSchema,
  projectId: idSchema.optional().nullable(),
  invoiceNumber: trimmed(64),
  issueDate: isoDateSchema,
  dueDate: isoDateSchema.optional().nullable(),
  currency: z.string().trim().length(3).toUpperCase().default('ETB'),
  taxRate: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(valuesOf(INVOICE_STATUS)).default(INVOICE_STATUS.DRAFT),
  notes: optionalText(2000),
  items: z
    .array(
      z.object({
        description: trimmed(500),
        quantity: z.coerce.number().min(0.01).max(1000000),
        unitPrice: moneyInputSchema,
      }),
    )
    .min(1, 'An invoice needs at least one line item')
    .max(200),
});

/**
 * A transaction edit only touches the fields it names.
 *
 * The create schema cannot be reused here: its `status` and `currency` defaults
 * would be written onto the row on every PUT, quietly turning a `failed`
 * transaction back into a `completed` one.
 */
export const updateTransactionSchema = z
  .object({
    type: z.enum(valuesOf(TRANSACTION_TYPE)).optional(),
    amount: moneyInputSchema.optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
    categoryId: idSchema.optional().nullable(),
    clientId: idSchema.optional().nullable(),
    projectId: idSchema.optional().nullable(),
    description: trimmed(500).optional(),
    transactionDate: isoDateSchema.optional(),
    paymentMethod: z.enum(valuesOf(PAYMENT_METHOD)).optional().nullable(),
    reference: optionalText(120),
    status: z.enum(valuesOf(TRANSACTION_STATUS)).optional(),
    notes: optionalText(2000),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/**
 * An invoice edit only touches the fields it names, and its line items are
 * optional — sending the items replaces them, sending nothing keeps them.
 *
 * Reusing the create schema here defaulted `status` to `draft` and `taxRate` to
 * 0, so editing an issued invoice silently reverted it to a draft and wiped
 * its tax.
 */
export const updateInvoiceSchema = z
  .object({
    projectId: idSchema.optional().nullable(),
    dueDate: isoDateSchema.optional().nullable(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
    status: z.enum(valuesOf(INVOICE_STATUS)).optional(),
    notes: optionalText(2000),
    items: z
      .array(
        z.object({
          description: trimmed(500),
          quantity: z.coerce.number().min(0.01).max(1000000),
          unitPrice: moneyInputSchema,
        }),
      )
      .min(1, 'An invoice needs at least one line item')
      .max(200)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const upsertPaymentSchema = z.object({
  invoiceId: idSchema,
  amount: moneyInputSchema,
  currency: z.string().trim().length(3).toUpperCase().default('ETB'),
  paymentMethod: z.enum(valuesOf(PAYMENT_METHOD)).optional().nullable(),
  reference: optionalText(120),
  paidAt: isoDateSchema,
  notes: optionalText(1000),
});

export const upsertFinancialCategorySchema = z.object({
  name: trimmed(120),
  type: z.enum(valuesOf(TRANSACTION_TYPE)),
  isSystem: z.boolean().default(false),
});

/* -------------------------------------------------------------------------- */
/* Blog                                                                       */
/* -------------------------------------------------------------------------- */

export const upsertBlogPostSchema = z.object({
  title: trimmed(191),
  slug: slugSchema.optional(),
  excerpt: optionalText(500),
  content: trimmed(120000),
  featuredMediaId: idSchema.optional().nullable(),
  authorId: idSchema.optional().nullable(),
  status: z.enum(['draft', 'published']).default('draft'),
  publishedAt: isoDateSchema.optional().nullable(),
  categoryIds: z.array(idSchema).max(10).default([]),
  tagIds: z.array(idSchema).max(30).default([]),
  metaTitle: optionalText(191),
  metaDescription: optionalText(400),
});

export const upsertBlogTaxonomySchema = z.object({
  name: trimmed(120),
  slug: slugSchema.optional(),
  description: optionalText(500),
});

/**
 * A post edit only touches the fields it names.
 *
 * Reusing the create schema defaulted `status` to draft and cleared the
 * categories and tags, so editing a published post quietly unpublished it and
 * removed it from its sections.
 */
export const updateBlogPostSchema = z
  .object({
    title: trimmed(191).optional(),
    slug: slugSchema.optional(),
    excerpt: optionalText(500),
    content: trimmed(120000).optional(),
    featuredMediaId: idSchema.optional().nullable(),
    authorId: idSchema.optional().nullable(),
    status: z.enum(['draft', 'published']).optional(),
    publishedAt: isoDateSchema.optional().nullable(),
    categoryIds: z.array(idSchema).max(10).optional(),
    tagIds: z.array(idSchema).max(30).optional(),
    metaTitle: optionalText(191),
    metaDescription: optionalText(400),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/* -------------------------------------------------------------------------- */
/* Inquiries                                                                  */
/* -------------------------------------------------------------------------- */

export const publicContactSchema = z.object({
  name: trimmed(160),
  email: emailSchema,
  phone: optionalText(60),
  company: optionalText(191),
  subject: optionalText(191),
  serviceId: idSchema.optional().nullable(),
  message: z.string().trim().min(20, 'Please give us at least 20 characters').max(4000),
  website: z.string().max(0, 'Rejected').optional().default(''),
});

export const updateInquirySchema = z.object({
  status: z.enum(valuesOf(INQUIRY_STATUS)).optional(),
  isRead: z.boolean().optional(),
  assignedToId: idSchema.optional().nullable(),
  notes: optionalText(4000).optional(),
  isArchived: z.boolean().optional(),
});

/* -------------------------------------------------------------------------- */
/* Media                                                                      */
/* -------------------------------------------------------------------------- */

export const updateMediaSchema = z.object({
  altText: optionalText(300),
  title: optionalText(300),
  caption: optionalText(500),
});

/* -------------------------------------------------------------------------- */
/* Testimonials, stats, jobs, social links                                    */
/* -------------------------------------------------------------------------- */

export const upsertTestimonialSchema = z.object({
  authorName: trimmed(160),
  authorPosition: optionalText(160),
  authorCompany: optionalText(160),
  authorPhotoMediaId: idSchema.optional().nullable(),
  clientId: idSchema.optional().nullable(),
  body: trimmed(2000),
  rating: z.coerce.number().int().min(1).max(5).optional().nullable(),
  isPublished: z.boolean().default(false),
  displayOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

export const upsertCompanyStatSchema = z.object({
  label: trimmed(120),
  value: trimmed(60),
  description: optionalText(300),
  icon: optionalText(60),
  displayOrder: z.coerce.number().int().min(0).max(100000).default(0),
  isPublished: z.boolean().default(false),
});

export const upsertJobSchema = z.object({
  title: trimmed(191),
  slug: slugSchema.optional(),
  departmentId: idSchema.optional().nullable(),
  employmentType: optionalText(120),
  location: optionalText(160),
  isRemote: z.boolean().default(false),
  summary: optionalText(500),
  description: trimmed(20000),
  requirements: optionalText(8000),
  applyEmail: emailSchema.optional().nullable(),
  applyUrl: z.string().trim().url().optional().or(z.literal('')).nullable(),
  isPublished: z.boolean().default(false),
  closesAt: isoDateSchema.optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).max(100000).default(0),
});

/**
 * A testimonial edit only touches the fields it names.
 *
 * Reusing the create schema defaulted `isPublished` to false, so editing a
 * live testimonial took it off the site.
 */
export const updateTestimonialSchema = z
  .object({
    authorName: trimmed(160).optional(),
    authorPosition: optionalText(160),
    authorCompany: optionalText(160),
    authorPhotoMediaId: idSchema.optional().nullable(),
    clientId: idSchema.optional().nullable(),
    body: trimmed(2000).optional(),
    rating: z.coerce.number().int().min(1).max(5).optional().nullable(),
    isPublished: z.boolean().optional(),
    displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/**
 * A company stat edit only touches the fields it names.
 *
 * Reusing the create schema defaulted `isPublished` to false, so editing a
 * headline figure took it off the homepage.
 */
export const updateCompanyStatSchema = z
  .object({
    label: trimmed(120).optional(),
    value: trimmed(60).optional(),
    description: optionalText(300),
    icon: optionalText(60),
    displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
    isPublished: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/**
 * A job edit only touches the fields it names.
 *
 * Reusing the create schema defaulted `isPublished` to false, so editing a
 * live vacancy took it off the careers page.
 */
export const updateJobSchema = z
  .object({
    title: trimmed(191).optional(),
    slug: slugSchema.optional(),
    departmentId: idSchema.optional().nullable(),
    employmentType: optionalText(120),
    location: optionalText(160),
    isRemote: z.boolean().optional(),
    summary: optionalText(500),
    description: trimmed(20000).optional(),
    requirements: optionalText(8000),
    applyEmail: emailSchema.optional().nullable(),
    applyUrl: z.string().trim().url().optional().or(z.literal('')).nullable(),
    isPublished: z.boolean().optional(),
    closesAt: isoDateSchema.optional().nullable(),
    displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const upsertSocialLinkSchema = z.object({
  platform: trimmed(60),
  label: optionalText(120),
  url: z.string().trim().url(),
  displayOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

export const upsertDepartmentSchema = z.object({
  name: trimmed(120),
  description: optionalText(500),
  displayOrder: z.coerce.number().int().min(0).max(10000).default(0),
});

/* -------------------------------------------------------------------------- */
/* Tasks                                                                      */
/* -------------------------------------------------------------------------- */

export const upsertTaskSchema = z.object({
  title: trimmed(200),
  description: optionalText(4000),
  status: z.enum(valuesOf(TASK_STATUS)).default(TASK_STATUS.TODO),
  priority: z.enum(valuesOf(TASK_PRIORITY)).default(TASK_PRIORITY.MEDIUM),
  assigneeId: z.coerce.number().int().min(1).nullable().optional(),
  clientId: z.coerce.number().int().min(1).nullable().optional(),
  projectId: z.coerce.number().int().min(1).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const updateTaskSchema = partialUpdate(upsertTaskSchema);

export const listTasksQuerySchema = paginationQuerySchema.extend({
  status: z.enum(valuesOf(TASK_STATUS)).optional(),
  priority: z.enum(valuesOf(TASK_PRIORITY)).optional(),
  assigneeId: z.coerce.number().int().min(1).optional(),
  openOnly: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => value === true || value === 'true' || value === '1')
    .optional(),
});

/** The window the team performance report is measured over. */
export const taskPerformanceQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d', 'year', 'all']).optional(),
});

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export const updateSettingsSchema = z
  .object({
    siteUrl: z.string().trim().url().optional().or(z.literal('')),
    defaultMetaTitle: optionalText(191),
    defaultMetaDescription: optionalText(400),
    ogImageMediaId: idSchema.optional().nullable(),
    contactEmail: emailSchema.optional().nullable(),
    contactPhone: optionalText(60),
    contactAddress: optionalText(300),
    brandPrimaryColor: hexColorSchema.optional(),
    brandAccentColor: hexColorSchema.optional(),
    analyticsId: optionalText(64),
    facebookPixelId: optionalText(64),
    inquiryNotificationEmail: emailSchema.optional().nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one setting to update');

export const telegramConnectSchema = z.object({
  token: z.string().trim().min(20, 'Paste the full bot token').max(200),
  name: optionalText(120),
});

export const telegramSettingsSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    welcomeMessage: z.string().trim().max(4000).optional().nullable(),
    awayMessage: z.string().trim().max(4000).optional().nullable(),
    awayMode: z.boolean().optional(),
    awayCooldownMinutes: z.coerce.number().int().min(0).max(1440).optional(),
    catalogEnabled: z.boolean().optional(),
    catalogIntro: z.string().trim().max(1000).optional().nullable(),
    menuEnabled: z.boolean().optional(),
    menuTitle: z.string().trim().max(300).optional().nullable(),
    replyToNewChats: z.boolean().optional(),
    replyToReturningChats: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one setting to update');

/** Ordered media ids for a Telegram photo album (max 10 per album). */
const telegramMediaIdsSchema = z.array(idSchema).max(10, 'An album can hold at most 10 images');

const telegramPriceSchema = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .refine(
    (value) =>
      value === null ||
      value === undefined ||
      value === '' ||
      /^\d{1,12}(\.\d{1,2})?$/.test(String(value).trim()),
    'Enter a price with up to 2 decimal places',
  );

export const telegramCatalogSchema = z.object({
  name: trimmed(191),
  description: z.string().trim().max(2000).optional().nullable(),
  price: telegramPriceSchema,
  currency: z.string().trim().length(3).toUpperCase().optional(),
  imageMediaId: idSchema.optional().nullable(),
  imageMediaIds: telegramMediaIdsSchema.optional().nullable(),
  isActive: z.boolean().optional(),
  displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
});

export const updateTelegramCatalogSchema = partialUpdate(telegramCatalogSchema);

export const telegramConversationQuerySchema = paginationQuerySchema.extend({
  accountId: z.coerce.number().int().positive().optional(),
  all: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => value === true || value === 'true' || value === '1')
    .optional(),
});

export const telegramCatalogQuerySchema = z.object({
  activeOnly: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => value === true || value === 'true' || value === '1')
    .optional(),
});

/** Aggregate auto-reply analytics: a bounded window, no free-text filters. */
export const telegramAnalyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const telegramActiveSchema = z.object({
  isActive: z.boolean(),
});

/**
 * Personal Telegram login (MTProto).
 *
 * `apiHash` is optional so the edit form can leave it blank to keep the stored
 * value, but the service still requires one on first save.
 */
export const telegramAccountConfigSchema = z.object({
  apiId: z.coerce.number().int().positive().max(999999999),
  apiHash: z.string().trim().max(200).optional().default(''),
  phoneNumber: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{8,16}$/, 'Use international format, e.g. +251912345678'),
});

export const telegramAccountCodeSchema = z.object({
  code: z.string().trim().min(1, 'Enter the login code').max(32),
});

export const telegramAccountPasswordSchema = z.object({
  password: z.string().min(1, 'Enter your Telegram 2FA password').max(1000),
});

export const telegramRuleSchema = z.object({
  name: trimmed(120),
  trigger: z.enum(['any', 'new_chat', 'returning_chat', 'keyword', 'exact', 'regex']),
  keywords: z.string().trim().max(4000).optional().nullable(),
  replyText: z.string().trim().max(4000).optional().nullable(),
  sendCatalog: z.boolean().optional(),
  imageMediaIds: telegramMediaIdsSchema.optional().nullable(),
  // The one audio file the rule replies with.
  audioMediaId: idSchema.optional().nullable(),
  showMenu: z.boolean().optional(),
  cooldownMinutes: z.coerce.number().int().min(0).max(10080).optional(),
  priority: z.coerce.number().int().min(-1000).max(1000).optional(),
  stopProcessing: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const updateTelegramRuleSchema = partialUpdate(telegramRuleSchema);

/**
 * A one-off message sent on the account's own behalf.
 *
 * Used by the "send a test message" control, which exists so somebody can
 * check that a connection works without waiting for a visitor to write first.
 */
export const telegramTestMessageSchema = z.object({
  chatId: z.coerce.number().int().positive(),
  text: z.string().trim().min(1, 'Enter a message to send').max(4000),
});

/**
 * A per-chat switch: block a chat, or turn its auto-reply off.
 *
 * A chat id is all that is kept about a chat.
 */
export const telegramChatSwitchSchema = z.object({
  chatId: z.coerce.number().int().positive(),
  isBlocked: z.boolean().optional(),
  autoReplyEnabled: z.boolean().optional(),
});

export const telegramMenuButtonSchema = z.object({
  parentId: idSchema.optional().nullable(),
  label: trimmed(64),
  action: z.enum(['catalog', 'text', 'album', 'url', 'submenu', 'menu']),
  replyText: z.string().trim().max(4000).optional().nullable(),
  url: z.string().trim().max(2048).optional().nullable(),
  imageMediaIds: telegramMediaIdsSchema.optional().nullable(),
  displayOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});

export const updateTelegramMenuButtonSchema = partialUpdate(telegramMenuButtonSchema);

export const telegramConversationUpdateSchema = z
  .object({
    autoReplyEnabled: z.boolean().optional(),
    isBlocked: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Provide a conversation setting to update');

export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: idSchema, displayOrder: z.coerce.number().int().min(0).max(100000) }))
    .min(1)
    .max(200),
});

/**
 * Date range for clearing activity logs.
 *
 * Both bounds are optional individually, but at least one is required. Deleting
 * the audit trail is irreversible, so a request that names no range is refused
 * rather than silently wiping the whole table.
 */
export const clearActivitySchema = z
  .object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  })
  .refine((value) => Boolean(value.from || value.to), {
    message: 'Choose a start or end date',
  });

/* -------------------------------------------------------------------------- */
/* User chat                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Create a chat.
 *
 * Private: `memberIds` holds the single other person (a private chat is a
 * singleton — creating a second one would splinter the thread). Group:
 * `title` (≤100 chars) plus the other members; the creator is added
 * automatically and deduplicated.
 */
export const chatCreateSchema = z.object({
  isGroup: z.boolean().default(false),
  title: z.string().trim().min(1, 'Choose a name').max(100, 'The name is too long').optional(),
  memberIds: z.array(z.coerce.number().int().positive()).min(1).max(50).default([]),
});

/** Page through a conversation's history. */
export const chatMessagesQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const chatSendSchema = z.object({
  text: z.string().trim().max(5000, 'That is too long').optional().default(''),
  imageMediaId: z.coerce.number().int().positive().optional(),
  replyToId: z.coerce.number().int().positive().optional(),
}).refine((value) => value.text.length > 0 || value.imageMediaId, {
  message: 'Write a message or attach a photo',
  path: ['text'],
});

export const chatEditSchema = z.object({
  text: z.string().trim().min(1, 'Nothing to send').max(5000, 'That is too long'),
});

/** Advance the read cursor manually — `messageId` optional (means "everything"). */
export const chatReadSchema = z.object({
  messageId: z.coerce.number().int().positive().optional(),
});

export const chatReactionSchema = z.object({
  emoji: z.string().trim().min(1, 'Pick an emoji').max(40, 'That emoji is too long'),
});

export const chatSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search needs text').max(500, 'Search is too long'),
});

export const chatLinkPreviewQuerySchema = z.object({
  url: z.string().trim().min(1, 'Enter a URL').url('Enter an http(s) URL'),
});

export const chatPinSchema = z.object({
  pinned: z.boolean().default(true),
});

export const chatMuteSchema = z.object({
  muted: z.boolean().default(true),
});
