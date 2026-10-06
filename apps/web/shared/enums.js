/**
 * Canonical enum values. These strings are what the database stores and what the
 * API accepts on the wire.
 */

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  FINANCE: 'FINANCE',
  // Granular team roles
  SOFTWARE_ENGINEER: 'SOFTWARE_ENGINEER',
  VIDEO_EDITOR: 'VIDEO_EDITOR',
  DESIGNER: 'DESIGNER',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  CONTENT_WRITER: 'CONTENT_WRITER',
  SOCIAL_MEDIA_MANAGER: 'SOCIAL_MEDIA_MANAGER',
  GRAPHIC_DESIGNER: 'GRAPHIC_DESIGNER',
  MOTION_DESIGNER: 'MOTION_DESIGNER',
  COPYWRITER: 'COPYWRITER',
  SEO_SPECIALIST: 'SEO_SPECIALIST',
  MARKETING_COORDINATOR: 'MARKETING_COORDINATOR',
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

export const DELIVERABLE_TYPE = Object.freeze({
  VIDEO: 'video',
  IMAGE: 'image',
  DESIGN: 'design',
  COPY: 'copy',
  WEB: 'web',
  SOCIAL: 'social',
  OTHER: 'other',
});

export const DELIVERABLE_TYPE_LABELS = Object.freeze({
  [DELIVERABLE_TYPE.VIDEO]: 'Video',
  [DELIVERABLE_TYPE.IMAGE]: 'Image / photo',
  [DELIVERABLE_TYPE.DESIGN]: 'Design',
  [DELIVERABLE_TYPE.COPY]: 'Copywriting',
  [DELIVERABLE_TYPE.WEB]: 'Web',
  [DELIVERABLE_TYPE.SOCIAL]: 'Social post',
  [DELIVERABLE_TYPE.OTHER]: 'Other',
});

export const METRIC_PLATFORM = Object.freeze({
  YOUTUBE: 'youtube',
  TIKTOK: 'tiktok',
  FACEBOOK: 'facebook',
  INSTAGRAM: 'instagram',
  LINKEDIN: 'linkedin',
  X: 'x',
  WEBSITE: 'website',
  OTHER: 'other',
});

export const METRIC_PLATFORM_LABELS = Object.freeze({
  [METRIC_PLATFORM.YOUTUBE]: 'YouTube',
  [METRIC_PLATFORM.TIKTOK]: 'TikTok',
  [METRIC_PLATFORM.FACEBOOK]: 'Facebook',
  [METRIC_PLATFORM.INSTAGRAM]: 'Instagram',
  [METRIC_PLATFORM.LINKEDIN]: 'LinkedIn',
  [METRIC_PLATFORM.X]: 'X',
  [METRIC_PLATFORM.WEBSITE]: 'Website',
  [METRIC_PLATFORM.OTHER]: 'Other',
});

export const METRIC_SOURCE = Object.freeze({
  MANUAL: 'manual',
  API: 'api',
});

export const TASK_STATUS = Object.freeze({
  TODO: 'todo',
  IN_PROGRESS: 'in_progress',
  REVIEW: 'review',
  BLOCKED: 'blocked',
  DONE: 'done',
  CANCELLED: 'cancelled',
});

export const TASK_PRIORITY = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
});

export const TASK_STATUS_LABELS = Object.freeze({
  [TASK_STATUS.TODO]: 'To do',
  [TASK_STATUS.IN_PROGRESS]: 'In progress',
  [TASK_STATUS.REVIEW]: 'In review',
  [TASK_STATUS.BLOCKED]: 'Blocked',
  [TASK_STATUS.DONE]: 'Done',
  [TASK_STATUS.CANCELLED]: 'Cancelled',
});

export const TASK_PRIORITY_LABELS = Object.freeze({
  [TASK_PRIORITY.LOW]: 'Low',
  [TASK_PRIORITY.MEDIUM]: 'Medium',
  [TASK_PRIORITY.HIGH]: 'High',
  [TASK_PRIORITY.URGENT]: 'Urgent',
});

export const CONTENT_STAGE = Object.freeze({
  IDEA: 'idea',
  BRAINSTORMING: 'brainstorming',
  WRITING: 'writing',
  APPROVAL: 'approval',
  REVISION: 'revision',
  SHOOTING: 'shooting',
  EDITING: 'editing',
  SCHEDULED: 'scheduled',
  POSTED: 'posted',
});

export const CONTENT_STAGE_LABELS = Object.freeze({
  [CONTENT_STAGE.IDEA]: 'Idea',
  [CONTENT_STAGE.BRAINSTORMING]: 'Brainstorming',
  [CONTENT_STAGE.WRITING]: 'Writing',
  [CONTENT_STAGE.APPROVAL]: 'Client approval',
  [CONTENT_STAGE.REVISION]: 'Needs revision',
  [CONTENT_STAGE.SHOOTING]: 'Shooting',
  [CONTENT_STAGE.EDITING]: 'Editing',
  [CONTENT_STAGE.SCHEDULED]: 'Scheduled',
  [CONTENT_STAGE.POSTED]: 'Posted',
});

export const CONTENT_STAGE_ORDER = Object.freeze([
  CONTENT_STAGE.IDEA,
  CONTENT_STAGE.BRAINSTORMING,
  CONTENT_STAGE.WRITING,
  CONTENT_STAGE.APPROVAL,
  CONTENT_STAGE.REVISION,
  CONTENT_STAGE.SHOOTING,
  CONTENT_STAGE.EDITING,
  CONTENT_STAGE.SCHEDULED,
  CONTENT_STAGE.POSTED,
]);

export const CONTENT_BLOCKED_STAGES = Object.freeze([
  CONTENT_STAGE.APPROVAL,
]);

export const CONTENT_OPEN_STAGES = Object.freeze(
  CONTENT_STAGE_ORDER.filter((stage) => stage !== CONTENT_STAGE.POSTED),
);

export const PROPOSAL_STATUS = Object.freeze({
  DRAFT: 'draft',
  SENT: 'sent',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
});

export const PROPOSAL_STATUS_LABELS = Object.freeze({
  [PROPOSAL_STATUS.DRAFT]: 'Draft',
  [PROPOSAL_STATUS.SENT]: 'Sent to client',
  [PROPOSAL_STATUS.ACCEPTED]: 'Accepted',
  [PROPOSAL_STATUS.DECLINED]: 'Declined',
});

export const DEFAULT_CURRENCY = 'ETB';

export const STATUS_LABELS = Object.freeze({
  [CLIENT_STATUS.PROSPECT]: 'Prospect',
  [CLIENT_STATUS.ACTIVE]: 'Active',
  [CLIENT_STATUS.INACTIVE]: 'Inactive',
  [CLIENT_STATUS.CHURNED]: 'Churned',
  [PROJECT_STATUS.PLANNING]: 'Planning',
  [PROJECT_STATUS.IN_PROGRESS]: 'In progress',
  [PROJECT_STATUS.REVIEW]: 'Review',
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

export const valuesOf = (enumObject) => Object.freeze(Object.values(enumObject));
