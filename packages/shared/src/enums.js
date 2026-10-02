/**
 * Canonical enum values. These strings are what the database stores and what the
 * API accepts on the wire. Both the API and the web app import from here so a
 * value can never drift between the two.
 */

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  FINANCE: 'FINANCE',
});

export const CLIENT_STATUS = Object.freeze({
  PROSPECT: 'prospect',
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  CHURNED: 'churned',
});

export const CLIENT_SOURCE = Object.freeze({
  WEBSITE: 'website',
  REFERRAL: 'referral',
  PHONE: 'phone',
  SOCIAL: 'social',
  WALK_IN: 'walk_in',
  OTHER: 'other',
});

export const PROJECT_STATUS = Object.freeze({
  PLANNING: 'planning',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  ON_HOLD: 'on_hold',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
});

export const INQUIRY_STATUS = Object.freeze({
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  CONVERTED: 'converted',
  CLOSED: 'closed',
});

export const TRANSACTION_TYPE = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
});

export const TRANSACTION_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

export const PAYMENT_METHOD = Object.freeze({
  BANK_TRANSFER: 'bank_transfer',
  CASH: 'cash',
  CHEQUE: 'cheque',
  MOBILE_MONEY: 'mobile_money',
  CARD: 'card',
  OTHER: 'other',
});

export const INVOICE_STATUS = Object.freeze({
  DRAFT: 'draft',
  ISSUED: 'issued',
  PARTIALLY_PAID: 'partially_paid',
  PAID: 'paid',
  OVERDUE: 'overdue',
  VOID: 'void',
});

export const EMPLOYMENT_STATUS = Object.freeze({
  ACTIVE: 'active',
  ON_LEAVE: 'on_leave',
  INACTIVE: 'inactive',
});

export const SHAREHOLDER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXITED: 'exited',
});

export const SHARE_CLASS = Object.freeze({
  ORDINARY: 'ordinary',
  PREFERRED: 'preferred',
  FOUNDERS: 'founders',
});

export const ACTIVITY_ACTION = Object.freeze({
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  PUBLISH: 'publish',
  UNPUBLISH: 'unpublish',
  ARCHIVE: 'archive',
  RESTORE: 'restore',
  FINANCIAL_CREATE: 'financial_create',
  FINANCIAL_UPDATE: 'financial_update',
  FINANCIAL_DELETE: 'financial_delete',
  CLIENT_UPDATE: 'client_update',
  EMPLOYEE_UPDATE: 'employee_update',
  PORTFOLIO_UPDATE: 'portfolio_update',
  PASSWORD_CHANGE: 'password_change',
  ROLE_CHANGE: 'role_change',
});

export const ENTITY = Object.freeze({
  USER: 'user',
  ROLE: 'role',
  COMPANY: 'company',
  EMPLOYEE: 'employee',
  SHAREHOLDER: 'shareholder',
  CLIENT: 'client',
  SERVICE: 'service',
  PROJECT: 'project',
  MEDIA: 'media',
  BLOG_POST: 'blog_post',
  BLOG_CATEGORY: 'blog_category',
  BLOG_TAG: 'blog_tag',
  TESTIMONIAL: 'testimonial',
  INQUIRY: 'inquiry',
  TRANSACTION: 'transaction',
  INVOICE: 'invoice',
  PAYMENT: 'payment',
  ACTIVITY_LOG: 'activity_log',
  SETTINGS: 'settings',
});

export const MEDIA_KIND = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
  SVG: 'svg',
});

export const DEFAULT_CURRENCY = 'ETB';

/** Human-readable labels so admin UI does not hard-code copy per status. */
export const STATUS_LABELS = Object.freeze({
  [CLIENT_STATUS.PROSPECT]: 'Prospect',
  [CLIENT_STATUS.ACTIVE]: 'Active',
  [CLIENT_STATUS.INACTIVE]: 'Inactive',
  [CLIENT_STATUS.CHURNED]: 'Churned',
  [PROJECT_STATUS.PLANNING]: 'Planning',
  [PROJECT_STATUS.IN_PROGRESS]: 'In progress',
  [PROJECT_STATUS.REVIEW]: 'In review',
  [PROJECT_STATUS.ON_HOLD]: 'On hold',
  [PROJECT_STATUS.COMPLETED]: 'Completed',
  [PROJECT_STATUS.CANCELLED]: 'Cancelled',
  [INQUIRY_STATUS.NEW]: 'New',
  [INQUIRY_STATUS.CONTACTED]: 'Contacted',
  [INQUIRY_STATUS.QUALIFIED]: 'Qualified',
  [INQUIRY_STATUS.CONVERTED]: 'Converted',
  [INQUIRY_STATUS.CLOSED]: 'Closed',
  [TRANSACTION_STATUS.PENDING]: 'Pending',
  [TRANSACTION_STATUS.COMPLETED]: 'Completed',
  [TRANSACTION_STATUS.FAILED]: 'Failed',
  [TRANSACTION_STATUS.REFUNDED]: 'Refunded',
  [INVOICE_STATUS.DRAFT]: 'Draft',
  [INVOICE_STATUS.ISSUED]: 'Issued',
  [INVOICE_STATUS.PARTIALLY_PAID]: 'Partially paid',
  [INVOICE_STATUS.PAID]: 'Paid',
  [INVOICE_STATUS.OVERDUE]: 'Overdue',
  [INVOICE_STATUS.VOID]: 'Void',
  [EMPLOYMENT_STATUS.ACTIVE]: 'Active',
  [EMPLOYMENT_STATUS.ON_LEAVE]: 'On leave',
  [EMPLOYMENT_STATUS.INACTIVE]: 'Inactive',
  [SHAREHOLDER_STATUS.ACTIVE]: 'Active',
  [SHAREHOLDER_STATUS.INACTIVE]: 'Inactive',
  [SHAREHOLDER_STATUS.EXITED]: 'Exited',
});

/** Lookup helpers — return [] rather than throwing on an unknown value. */
export const valuesOf = (enumObject) => Object.freeze(Object.values(enumObject));