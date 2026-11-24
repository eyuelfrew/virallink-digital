'use strict';

const ROLES = Object.freeze({
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  EDITOR: 'EDITOR',
  FINANCE: 'FINANCE',
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

const ACTIVITY_ACTION = Object.freeze({
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

const ENTITY = Object.freeze({
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

module.exports = {
  ROLES,
  ACTIVITY_ACTION,
  ENTITY,
};
