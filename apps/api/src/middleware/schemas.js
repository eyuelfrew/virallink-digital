import { z } from 'zod';
import AppError from '../utils/AppError.js';
import { validate } from './validate.js';
import {
  changePasswordSchema,
  loginSchema,
  paginationQuerySchema,
  makeListQuerySchema,
  upsertCompanySchema,
  upsertEmployeeSchema,
  upsertShareholderSchema,
  upsertClientSchema,
  clientNoteSchema,
  upsertServiceSchema,
  upsertProjectSchema,
  upsertBlogPostSchema,
  upsertBlogTaxonomySchema,
  updateInquirySchema,
  upsertTransactionSchema,
  upsertInvoiceSchema,
  upsertPaymentSchema,
  upsertFinancialCategorySchema,
  upsertTestimonialSchema,
  upsertCompanyStatSchema,
  upsertJobSchema,
  upsertSocialLinkSchema,
  upsertDepartmentSchema,
  createUserSchema,
  updateUserSchema,
  upsertTaskSchema,
  updateTaskSchema,
  listTasksQuerySchema,
  upsertDeliverableSchema,
  updateDeliverableSchema,
  upsertMetricSchema,
  listDeliverablesQuerySchema,
  reportQuerySchema,
  setupAdminSchema,
  updateContentItemSchema,
  moveStageSchema,
  upsertProposalSchema,
  updateProposalSchema,
  weeklyReportQuerySchema,
  updateMediaSchema,
  reorderSchema,
  publicContactSchema,
} from '@virallink/shared/schemas';

/**
 * Route validation schemas.
 *
 * Sort fields are whitelisted per endpoint rather than passed through from the
 * client. Without this, `?sort=` could name any column, and a typo would silently
 * produce the wrong order instead of an error the developer would notice.
 */

const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/** Read an id from the params after validation, rejecting anything non-numeric. */
export function idFrom(request) {
  const id = request.params.id;
  if (!id || !/^\d+$/.test(String(id))) throw AppError.badRequest('Invalid identifier');
  return Number(id);
}

/**
 * Validated query parameters.
 *
 * Falls back to the raw query object when no query schema ran on the route, so a
 * handler never has to care which one applies.
 */
export function query(request) {
  return request.validatedQuery || query(request);
}

const OPTIONAL_BOOLEAN = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === '') return undefined;
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes'].includes(value.toLowerCase());
  });

export const schemas = {
  /* Auth */
  login: { source: 'body', schema: loginSchema },
  changePassword: { source: 'body', schema: changePasswordSchema },

  /* Generic list */
  pagination: { source: 'query', schema: paginationQuerySchema },

  /* Company */
  updateCompany: { source: 'body', schema: upsertCompanySchema },
  updateSocialLinks: { source: 'body', schema: z.object({ links: z.array(upsertSocialLinkSchema).max(20) }) },

  /* Employees */
  listEmployees: {
    source: 'query',
    schema: makeListQuerySchema(['name', 'position', 'displayOrder', 'createdAt', 'employmentStatus']).extend({
      departmentId: z.coerce.number().int().positive().optional(),
      status: z.string().optional(),
    }),
  },
  upsertEmployee: { source: 'body', schema: upsertEmployeeSchema },
  reorderEmployees: { source: 'body', schema: reorderSchema },

  /* Shareholders */
  listShareholders: {
    source: 'query',
    schema: makeListQuerySchema(['name', 'shareCount', 'ownershipPercentage', 'joinedAt', 'createdAt']).extend({
      status: z.string().optional(),
    }),
  },
  upsertShareholder: { source: 'body', schema: upsertShareholderSchema },

  /* Clients */
  listClients: {
    source: 'query',
    schema: makeListQuerySchema(['name', 'status', 'contractValue', 'createdAt', 'industry']).extend({
      status: z.string().optional(),
      source: z.string().optional(),
    }),
  },
  upsertClient: { source: 'body', schema: upsertClientSchema },
  clientNote: { source: 'body', schema: clientNoteSchema },
  clientCommunication: {
    source: 'body',
    schema: z.object({
      type: z.enum(['call', 'email', 'meeting', 'other']).default('call'),
      subject: z.string().trim().max(191).optional(),
      body: z.string().trim().max(6000).optional(),
      occurredAt: z.string().datetime().or(z.string().date()).optional(),
    }),
  },

  /* Services */
  listServices: {
    source: 'query',
    schema: makeListQuerySchema(['title', 'displayOrder', 'createdAt', 'slug']).extend({
      isPublished: OPTIONAL_BOOLEAN,
    }),
  },
  upsertService: { source: 'body', schema: upsertServiceSchema },
  reorderServices: { source: 'body', schema: reorderSchema },

  /* Projects */
  listProjects: {
    source: 'query',
    schema: makeListQuerySchema(['title', 'status', 'createdAt', 'displayOrder', 'publishedAt']).extend({
      status: z.string().optional(),
      serviceId: z.coerce.number().int().positive().optional(),
      isPublished: OPTIONAL_BOOLEAN,
    }),
  },
  upsertProject: { source: 'body', schema: upsertProjectSchema },
  reorderProjects: { source: 'body', schema: reorderSchema },

  /* Blog */
  listPosts: {
    source: 'query',
    schema: makeListQuerySchema(['title', 'status', 'createdAt', 'publishedAt']).extend({
      status: z.enum(['draft', 'published']).optional(),
    }),
  },
  upsertPost: { source: 'body', schema: upsertBlogPostSchema },
  upsertTaxonomy: { source: 'body', schema: upsertBlogTaxonomySchema },

  /* Inquiries */
  listInquiries: {
    source: 'query',
    schema: makeListQuerySchema(['createdAt', 'status', 'name', 'email']).extend({
      status: z.string().optional(),
      isRead: OPTIONAL_BOOLEAN,
      isArchived: OPTIONAL_BOOLEAN,
    }),
  },
  updateInquiry: { source: 'body', schema: updateInquirySchema },

  /* Finance */
  listTransactions: {
    source: 'query',
    schema: makeListQuerySchema(['transactionDate', 'amount', 'createdAt', 'description']).extend({
      type: z.enum(['income', 'expense']).optional(),
      status: z.string().optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  },
  listInvoices: {
    source: 'query',
    // Deliberately its own whitelist: the invoices list page sorts by issue
    // date, which is not a valid sort on transactions.
    schema: makeListQuerySchema(['invoiceNumber', 'issueDate', 'dueDate', 'total', 'status', 'createdAt']).extend({
      status: z.string().optional(),
      clientId: z.coerce.number().int().positive().optional(),
    }),
  },
  upsertTransaction: { source: 'body', schema: upsertTransactionSchema },
  upsertInvoice: { source: 'body', schema: upsertInvoiceSchema },
  upsertPayment: { source: 'body', schema: upsertPaymentSchema },
  upsertFinancialCategory: { source: 'body', schema: upsertFinancialCategorySchema },
  financeReport: {
    source: 'query',
    schema: z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
      type: z.enum(['income', 'expense']).optional(),
    }),
  },

  /* Activity */
  listActivity: {
    source: 'query',
    schema: makeListQuerySchema(['createdAt', 'action', 'entity']).extend({
      action: z.string().optional(),
      entity: z.string().optional(),
      userId: z.coerce.number().int().positive().optional(),
      from: z.string().datetime().or(z.string().date()).optional(),
      to: z.string().datetime().or(z.string().date()).optional(),
    }),
  },

  /* Media */
  listMedia: {
    source: 'query',
    schema: makeListQuerySchema(['createdAt', 'altText', 'kind', 'sizeBytes']).extend({
      kind: z.string().optional(),
    }),
  },
  updateMedia: { source: 'body', schema: updateMediaSchema },

  /* Branding collections */
  upsertTestimonial: { source: 'body', schema: upsertTestimonialSchema },
  upsertStat: { source: 'body', schema: upsertCompanyStatSchema },
  upsertJob: { source: 'body', schema: upsertJobSchema },
  upsertDepartment: { source: 'body', schema: upsertDepartmentSchema },
  listTestimonials: { source: 'query', schema: paginationQuerySchema },
  createUser: { source: 'body', schema: createUserSchema },
  upsertTask: { source: 'body', schema: upsertTaskSchema },
  updateTask: { source: 'body', schema: updateTaskSchema },
  listTasks: { source: 'query', schema: listTasksQuerySchema },
  upsertDeliverable: { source: 'body', schema: upsertDeliverableSchema },
  updateDeliverable: { source: 'body', schema: updateDeliverableSchema },
  upsertMetric: { source: 'body', schema: upsertMetricSchema },
  listDeliverables: { source: 'query', schema: listDeliverablesQuerySchema },
  report: { source: 'query', schema: reportQuerySchema },
  setupAdmin: { source: 'body', schema: setupAdminSchema },
  updateContentItem: { source: 'body', schema: updateContentItemSchema },
  moveStage: { source: 'body', schema: moveStageSchema },
  upsertProposal: { source: 'body', schema: upsertProposalSchema },
  updateProposal: { source: 'body', schema: updateProposalSchema },
  weeklyReport: { source: 'query', schema: weeklyReportQuerySchema },
  updateUser: { source: 'body', schema: updateUserSchema },
  listUsers: { source: 'query', schema: paginationQuerySchema },
  listJobs: {
    source: 'query',
    schema: paginationQuerySchema.extend({ isPublished: OPTIONAL_BOOLEAN }),
  },

  /* Public reads */
  publicList: { source: 'query', schema: paginationQuerySchema.extend({ pageSize: z.coerce.number().int().min(1).max(50).default(12) }) },
  publicPortfolio: {
    source: 'query',
    schema: paginationQuerySchema.extend({
      pageSize: z.coerce.number().int().min(1).max(48).default(12),
      service: z.string().trim().max(191).optional(),
      featured: OPTIONAL_BOOLEAN,
    }),
  },
  publicBlog: {
    source: 'query',
    schema: paginationQuerySchema.extend({
      pageSize: z.coerce.number().int().min(1).max(24).default(10),
      category: z.string().trim().max(191).optional(),
      tag: z.string().trim().max(191).optional(),
    }),
  },
  publicContact: { source: 'body', schema: publicContactSchema },

  idParam: { source: 'params', schema: idParamSchema },
};

/** Shorthand: validate(source, schema) → middleware. */
export const v = (name) => {
  const rule = schemas[name];
  if (!rule) throw new Error(`Unknown validation schema: ${name}`);
  return validate(rule.source, rule.schema);
};

export default schemas;