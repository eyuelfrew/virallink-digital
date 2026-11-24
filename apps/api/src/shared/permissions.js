/**
 * Role-based access control.
 *
 * The permission strings below are the single source of truth. They are seeded
 * into the `permissions` and `role_permissions` tables, enforced by API
 * middleware on every sensitive route, and also read by the web app to decide
 * which admin nav entries to render.
 *
 * IMPORTANT: hiding a nav item is cosmetic. Authorization is enforced server-side
 * on the API. Never rely on the UI to protect data.
 */

import { ROLES } from './enums.js';

/** Every permission the system knows about, grouped by resource. */
export const PERMISSIONS = Object.freeze({
  // Company profile / settings
  COMPANY_READ: 'company.read',
  COMPANY_WRITE: 'company.write',
  SETTINGS_READ: 'settings.read',
  SETTINGS_WRITE: 'settings.write',
  USER_READ: 'user.read',
  USER_WRITE: 'user.write',
  ROLE_READ: 'role.read',
  ROLE_WRITE: 'role.write',

  // People
  EMPLOYEE_READ: 'employee.read',
  EMPLOYEE_WRITE: 'employee.write',
  EMPLOYEE_DELETE: 'employee.delete',
  SHAREHOLDER_READ: 'shareholder.read',
  SHAREHOLDER_WRITE: 'shareholder.write',
  SHAREHOLDER_DELETE: 'shareholder.delete',

  // Clients
  CLIENT_READ: 'client.read',
  CLIENT_WRITE: 'client.write',
  CLIENT_DELETE: 'client.delete',
  INQUIRY_READ: 'inquiry.read',
  INQUIRY_WRITE: 'inquiry.write',

  // Public content
  SERVICE_READ: 'service.read',
  SERVICE_WRITE: 'service.write',
  SERVICE_DELETE: 'service.delete',
  PROJECT_READ: 'project.read',
  PROJECT_WRITE: 'project.write',
  PROJECT_DELETE: 'project.delete',
  BLOG_READ: 'blog.read',
  BLOG_WRITE: 'blog.write',
  BLOG_DELETE: 'blog.delete',
  TESTIMONIAL_WRITE: 'testimonial.write',
  JOB_WRITE: 'job.write',

  // Finance
  FINANCE_READ: 'finance.read',
  FINANCE_WRITE: 'finance.write',
  FINANCE_DELETE: 'finance.delete',

  // Media
  MEDIA_READ: 'media.read',
  MEDIA_WRITE: 'media.write',
  MEDIA_DELETE: 'media.delete',

  // Audit
  ACTIVITY_READ: 'activity.read',
  ACTIVITY_READ_OWN: 'activity.read_own',
  ACTIVITY_DELETE: 'activity.delete',

  // Task management
  TASK_READ: 'task.read',
  TASK_WRITE: 'task.write',
  TASK_DELETE: 'task.delete',
  TASK_ASSIGN: 'task.assign',

  // Content production pipeline
  CONTENT_READ: 'content.read',
  CONTENT_WRITE: 'content.write',

  // Telegram auto-reply
  TELEGRAM_READ: 'telegram.read',
  TELEGRAM_WRITE: 'telegram.write',
  TELEGRAM_MANAGE: 'telegram.manage',
  NOTIFICATION_WRITE: 'notification.write',
});

/** First path segment of every admin resource. */
export const ADMIN_RESOURCE_PREFIXES = Object.freeze([
  'dashboard', 'company', 'employees', 'shareholders', 'clients', 'services',
  'portfolio', 'blog', 'inquiries', 'finance', 'activity', 'media',
  'testimonials', 'stats', 'jobs', 'departments', 'users', 'roles', 'tasks',
  'deliverables', 'content', 'proposals', 'telegram-auto-reply', 'notifications', 'notifications',
]);

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

/**
 * Role ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ permission map. SUPER_ADMIN holds every permission.
 */
export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.SUPER_ADMIN]: ALL_PERMISSIONS,

  [ROLES.ADMIN]: [
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.COMPANY_WRITE,
    PERMISSIONS.SETTINGS_READ,
    PERMISSIONS.EMPLOYEE_READ,
    PERMISSIONS.EMPLOYEE_WRITE,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.CLIENT_WRITE,
    PERMISSIONS.INQUIRY_READ,
    PERMISSIONS.INQUIRY_WRITE,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_WRITE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.BLOG_READ,
    PERMISSIONS.BLOG_WRITE,
    PERMISSIONS.TESTIMONIAL_WRITE,
    PERMISSIONS.JOB_WRITE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_DELETE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.MEDIA_WRITE,
    PERMISSIONS.ACTIVITY_READ,
    PERMISSIONS.ACTIVITY_READ_OWN,
    PERMISSIONS.ACTIVITY_DELETE,
    PERMISSIONS.TELEGRAM_READ,
    PERMISSIONS.TELEGRAM_WRITE,
    PERMISSIONS.TELEGRAM_MANAGE,
    PERMISSIONS.NOTIFICATION_WRITE,
  ],

  [ROLES.EDITOR]: [
    PERMISSIONS.COMPANY_READ,
    PERMISSIONS.EMPLOYEE_READ,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.SERVICE_READ,
    PERMISSIONS.SERVICE_WRITE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.BLOG_READ,
    PERMISSIONS.BLOG_WRITE,
    PERMISSIONS.TESTIMONIAL_WRITE,
    PERMISSIONS.JOB_WRITE,
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.MEDIA_WRITE,
  ],

  [ROLES.FINANCE]: [
    PERMISSIONS.FINANCE_READ,
    PERMISSIONS.FINANCE_WRITE,
    PERMISSIONS.FINANCE_DELETE,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.INQUIRY_READ,
    PERMISSIONS.SHAREHOLDER_READ,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.ACTIVITY_READ,
  ],

  [ROLES.SOFTWARE_ENGINEER]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.MEDIA_WRITE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_WRITE,
  ],

  [ROLES.VIDEO_EDITOR]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.MEDIA_WRITE,
  ],

  [ROLES.DESIGNER]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.MEDIA_WRITE,
  ],

  [ROLES.PROJECT_MANAGER]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.CLIENT_WRITE,
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.EMPLOYEE_READ,
  ],

  [ROLES.CONTENT_WRITER]: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.BLOG_READ,
    PERMISSIONS.BLOG_WRITE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
  ],

  [ROLES.SOCIAL_MEDIA_MANAGER]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.MEDIA_WRITE,
  ],

  [ROLES.GRAPHIC_DESIGNER]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.MEDIA_WRITE,
  ],

  [ROLES.MOTION_DESIGNER]: [
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.MEDIA_WRITE,
  ],

  [ROLES.COPYWRITER]: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.BLOG_READ,
    PERMISSIONS.BLOG_WRITE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
  ],

  [ROLES.SEO_SPECIALIST]: [
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    PERMISSIONS.BLOG_READ,
    PERMISSIONS.BLOG_WRITE,
  ],

  [ROLES.MARKETING_COORDINATOR]: [
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.CLIENT_WRITE,
    PERMISSIONS.PROJECT_READ,
    PERMISSIONS.PROJECT_WRITE,
    PERMISSIONS.TASK_READ,
    PERMISSIONS.TASK_WRITE,
    PERMISSIONS.TASK_ASSIGN,
  ],
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.SUPER_ADMIN]: 'Super admin',
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.EDITOR]: 'Content editor',
  [ROLES.FINANCE]: 'Finance',
  [ROLES.SOFTWARE_ENGINEER]: 'Software Engineer',
  [ROLES.VIDEO_EDITOR]: 'Video Editor',
  [ROLES.DESIGNER]: 'Designer',
  [ROLES.PROJECT_MANAGER]: 'Project Manager',
  [ROLES.CONTENT_WRITER]: 'Content Writer',
  [ROLES.SOCIAL_MEDIA_MANAGER]: 'Social Media Manager',
  [ROLES.GRAPHIC_DESIGNER]: 'Graphic Designer',
  [ROLES.MOTION_DESIGNER]: 'Motion Designer',
  [ROLES.COPYWRITER]: 'Copywriter',
  [ROLES.SEO_SPECIALIST]: 'SEO Specialist',
  [ROLES.MARKETING_COORDINATOR]: 'Marketing Coordinator',
});

/**
 * Roles that name a job rather than a level of access.
 *
 * `SUPER_ADMIN` and `ADMIN` are levels of access ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â "Super admin" is not a job
 * title, and putting it on the public team page would be wrong. The rest
 * describe what the person actually does.
 */
export const JOB_ROLE_KEYS = Object.freeze([
  ROLES.EDITOR,
  ROLES.FINANCE,
  ROLES.SOFTWARE_ENGINEER,
  ROLES.VIDEO_EDITOR,
  ROLES.DESIGNER,
  ROLES.PROJECT_MANAGER,
  ROLES.CONTENT_WRITER,
  ROLES.SOCIAL_MEDIA_MANAGER,
  ROLES.GRAPHIC_DESIGNER,
  ROLES.MOTION_DESIGNER,
  ROLES.COPYWRITER,
  ROLES.SEO_SPECIALIST,
  ROLES.MARKETING_COORDINATOR,
]);

/**
 * The job title a role implies.
 *
 * An account's role already says what the person does. When that account is
 * turned into an employee profile, asking the administrator to type the same
 * thing into a second box is asking them to keep two records in step by hand ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â
 * and the two would quietly disagree the first time one of them was edited.
 *
 * Returns null for a role that names a level of access rather than a job.
 */
export function positionForRole(roleKey) {
  if (!roleKey || !JOB_ROLE_KEYS.includes(roleKey)) return null;
  return ROLE_LABELS[roleKey] || null;
}

/**
 * The job title implied by whichever of an account's roles names a job.
 *
 * An account can hold more than one role, and the first one is not always the
 * one that describes the work.
 */
export function positionForRoles(roleKeys = []) {
  for (const key of roleKeys) {
    const position = positionForRole(key);
    if (position) return position;
  }
  return null;
}

/**
 * The role a job title implies, when there is an unambiguous match.
 *
 * The reverse of `positionForRole`, and deliberately exact: a job title is
 * free text, so it is matched against the role's own label, ignoring case and
 * surrounding space. A title that matches nothing returns null rather than a
 * guess ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â "Head of Everything" is not the Marketing Coordinator role, and
 * guessing would grant the wrong permissions.
 */
export function roleForPosition(position) {
  const wanted = String(position || '').trim().toLowerCase();
  if (!wanted) return null;

  for (const key of JOB_ROLE_KEYS) {
    if (String(ROLE_LABELS[key] || '').trim().toLowerCase() === wanted) return key;
  }

  return null;
}

/** Navigation model for the admin sidebar. */
export const ADMIN_NAV = Object.freeze([
  { label: 'Dashboard', href: '/vira-admin/dashboard', icon: 'LayoutDashboard', permission: null, exact: true },
  { label: 'My tasks', href: '/vira-admin/my-tasks', icon: 'ListChecks', permission: null, exact: true },
  { label: 'My Telegram', href: '/vira-admin/my-telegram', icon: 'Send', permission: null, exact: true },
  {
    label: 'Tasks',
    href: '/vira-admin/tasks',
    icon: 'ListTodo',
    permission: PERMISSIONS.TASK_READ,
  },
  {
    label: 'Production',
    icon: 'ListTodo',
    permission: null,
    children: [
      { label: 'Pipeline board', href: '/vira-admin/content', icon: 'FolderOpen', permission: PERMISSIONS.CONTENT_READ },
      { label: 'Weekly report', href: '/vira-admin/content/weekly', icon: 'ChartColumn', permission: PERMISSIONS.CONTENT_READ },
      { label: 'Proposals', href: '/vira-admin/content/proposals', icon: 'Target', permission: PERMISSIONS.CONTENT_READ },
    ],
  },
  {
    label: 'Content',
    icon: 'FileStack',
    permission: null,
    children: [
      { label: 'Services', href: '/vira-admin/services', icon: 'Briefcase', permission: PERMISSIONS.SERVICE_READ },
      { label: 'Portfolio', href: '/vira-admin/portfolio', icon: 'FolderKanban', permission: PERMISSIONS.PROJECT_READ },
      { label: 'Blog', href: '/vira-admin/blog', icon: 'Newspaper', permission: PERMISSIONS.BLOG_READ },
      { label: 'Inquiries', href: '/vira-admin/inquiries', icon: 'Inbox', permission: PERMISSIONS.INQUIRY_READ },
    ],
  },
  {
    label: 'People',
    icon: 'Users',
    permission: null,
    children: [
      { label: 'Employees', href: '/vira-admin/employees', icon: 'UserRound', permission: PERMISSIONS.EMPLOYEE_READ },
      { label: 'Clients', href: '/vira-admin/clients', icon: 'Building2', permission: PERMISSIONS.CLIENT_READ },
      { label: 'Shareholders', href: '/vira-admin/shareholders', icon: 'PieChart', permission: PERMISSIONS.SHAREHOLDER_READ },
    ],
  },
  {
    label: 'Finance',
    icon: 'Wallet',
    permission: PERMISSIONS.FINANCE_READ,
    children: [
      { label: 'Transactions', href: '/vira-admin/finance/transactions', icon: 'ArrowLeftRight', permission: PERMISSIONS.FINANCE_READ },
      { label: 'Invoices', href: '/vira-admin/finance/invoices', icon: 'ReceiptText', permission: PERMISSIONS.FINANCE_READ },
    ],
  },
  {
    label: 'System',
    icon: 'Settings',
    permission: PERMISSIONS.SETTINGS_READ,
    children: [
      { label: 'Company', href: '/vira-admin/settings/company', icon: 'Building', permission: PERMISSIONS.COMPANY_READ },
      { label: 'Media', href: '/vira-admin/settings/media', icon: 'Image', permission: PERMISSIONS.MEDIA_READ },
      { label: 'Users & roles', href: '/vira-admin/settings/users', icon: 'ShieldCheck', permission: PERMISSIONS.USER_READ },
      { label: 'Activity log', href: '/vira-admin/activity', icon: 'History', permission: PERMISSIONS.ACTIVITY_READ },
      { label: 'Telegram auto-reply', href: '/vira-admin/telegram', icon: 'Send', permission: PERMISSIONS.TELEGRAM_READ },
    ],
  },
]);

/** Flatten the nav tree into the list of admin page permissions, for tests. */
export function permissionsForNav() {
  const set = new Set();
  for (const group of ADMIN_NAV) {
    if (group.permission) set.add(group.permission);
    for (const child of group.children || []) {
      if (child.permission) set.add(child.permission);
    }
  }
  return [...set];
}
