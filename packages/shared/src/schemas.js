/**
 * Zod schemas shared by the API (request validation) and the web app (form
 * pre-validation, admin client-side checks).
 *
 * Password rules are deliberately strong but not hostile: length is the dominant
 * factor, we forbid the handful of passwords that show up in every breach corpus,
 * and we do not force symbol soup on a human who will type this password daily.
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

/**
 * Sort fields are whitelisted per endpoint. Passing an unlisted field is a 422
 * rather than a silent fallback, so a typo in a query never returns wrong order.
 */
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

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately permissive: login must not leak password-policy rules, and the
  // strength check only applies when *changing* a password.
  password: z.string().min(1, 'Password is required').max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(200),
  newPassword: passwordSchema,
});

export const createUserSchema = z.object({
  name: trimmed(120),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(valuesOf(ROLES)),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z
  .object({
    name: trimmed(120).optional(),
    email: emailSchema.optional(),
    password: passwordSchema.optional(),
    role: z.enum(valuesOf(ROLES)).optional(),
    isActive: z.boolean().optional(),
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

/* -------------------------------------------------------------------------- */
/* Shareholders — private module, never exposed on a public route              */
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

export const clientNoteSchema = z.object({
  body: trimmed(4000),
});

/* -------------------------------------------------------------------------- */
/* First-run setup                                                            */
/* -------------------------------------------------------------------------- */

/*
 * Creating the very first administrator. Identical requirements to
 * createUserSchema, and deliberately so: a password too weak for the admin form
 * must not be creatable through the setup form either.
 */
export const setupAdminSchema = z.object({
  name: trimmed(120),
  email: emailSchema,
  password: passwordSchema,
});

/* -------------------------------------------------------------------------- */
/* Client reporting — deliverables and monthly metrics                        */
/* -------------------------------------------------------------------------- */

/**
 * Month as `YYYY-MM`.
 *
 * Validated as a real month rather than any 7-character string, because this is
 * the grouping key for every roll-up in the report. A typo would silently create
 * a second, empty bucket that then reads as "no activity that month".
 */
const monthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use the format YYYY-MM');

export const upsertDeliverableSchema = z.object({
  clientId: idSchema,
  title: trimmed(191),
  type: z.enum(valuesOf(DELIVERABLE_TYPE)).default(DELIVERABLE_TYPE.VIDEO),
  /** Where it went up. A URL is expected for anything actually published. */
  platform: z.enum(valuesOf(METRIC_PLATFORM)).default(METRIC_PLATFORM.OTHER),
  url: z.string().trim().url().optional().or(z.literal('')).nullable(),
  publishedAt: z.coerce.date().optional().nullable(),
  mediaId: idSchema.optional().nullable(),
  notes: optionalText(2000),

  /*
   * Pipeline fields. The same row is both the board card and the finished-work
   * record, so creating one has to be able to place it on the board. Omitting
   * `stage` leaves the default of `posted`, which is right for logging work after
   * the fact and wrong for starting a new card.
   */
  stage: z.enum(valuesOf(CONTENT_STAGE)).optional(),
  shootDate: z.union([z.coerce.date(), z.literal('')]).nullable().optional(),
  scheduledFor: z.union([z.coerce.date(), z.literal('')]).nullable().optional(),
  assigneeId: z.coerce.number().int().positive().nullable().optional(),
  idea: optionalText(4000),
  brainstormNotes: optionalText(4000),
  scriptBody: optionalText(8000),
});

export const updateDeliverableSchema = upsertDeliverableSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

/**
 * One month of performance for one deliverable on one platform.
 *
 * Counters are optional and nullable rather than defaulting to 0, so the report
 * can distinguish "we did not measure this" from "it genuinely was zero" — the
 * difference matters the moment a client asks why a figure is blank.
 */
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

export const updateMetricSchema = upsertMetricSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const listDeliverablesQuerySchema = paginationQuerySchema.extend({
  month: monthSchema.optional(),
  type: z.enum(valuesOf(DELIVERABLE_TYPE)).optional(),
  platform: z.enum(valuesOf(METRIC_PLATFORM)).optional(),
});

export const reportQuerySchema = z.object({
  /** Defaults to the current month when omitted. */
  month: monthSchema.optional(),
  /** How many trailing months to include for the trend line. */
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
    // Empty date inputs submit '', which is not a date. Accepted and turned into
    // null so a date can be cleared from the form.
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

/**
 * Moving a card.
 *
 * `note` is required only when the move represents work coming *back* from the
 * client. A rejection with no reason is the single most useless thing that can be
 * recorded, and requiring the reason is what makes the revision history worth
 * reading later.
 */
export const moveStageSchema = z
  .object({
    stage: z.enum(valuesOf(CONTENT_STAGE)),
    note: optionalText(2000),
    /** Set when sending to the client for the first time. */
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

export const updateProposalSchema = upsertProposalSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const weeklyReportQuerySchema = z.object({
  /** Any date inside the week; the service snaps it to that week's Monday. */
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
  // Honeypot: a real browser leaves this empty. Bots that fill every input do not.
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
/* Tasks (internal — never exposed on the public site)                         */
/* -------------------------------------------------------------------------- */

export const upsertTaskSchema = z.object({
  title: trimmed(200),
  description: optionalText(4000),
  status: z.enum(valuesOf(TASK_STATUS)).default(TASK_STATUS.TODO),
  priority: z.enum(valuesOf(TASK_PRIORITY)).default(TASK_PRIORITY.MEDIUM),
  // Optional links into the rest of the platform so a task can point at the work
  // it concerns. All optional, because a task is also a standalone reminder.
  assigneeId: z.coerce.number().int().min(1).nullable().optional(),
  clientId: z.coerce.number().int().min(1).nullable().optional(),
  projectId: z.coerce.number().int().min(1).nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

export const updateTaskSchema = upsertTaskSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const listTasksQuerySchema = paginationQuerySchema.extend({
  status: z.enum(valuesOf(TASK_STATUS)).optional(),
  priority: z.enum(valuesOf(TASK_PRIORITY)).optional(),
  assigneeId: z.coerce.number().int().min(1).optional(),
  // Lets the board request everything unfinished without enumerating the open
  // statuses on the client, where the list would drift from the enum.
  openOnly: z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
    .transform((value) => value === true || value === 'true' || value === '1')
    .optional(),
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

export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: idSchema, displayOrder: z.coerce.number().int().min(0).max(100000) }))
    .min(1)
    .max(200),
});