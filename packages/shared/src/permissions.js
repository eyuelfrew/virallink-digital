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

  // Task management (internal — never exposed on the public site)
  TASK_READ: 'task.read',
  TASK_WRITE: 'task.write',
  TASK_DELETE: 'task.delete',
  TASK_ASSIGN: 'task.assign',

  // Content production pipeline. Separate from client.* because moving a card
  // through approval is day-to-day production work, not client record-keeping —
  // a content editor needs to run the board without being able to edit a
  // client's contract value.
  CONTENT_READ: 'content.read',
  CONTENT_WRITE: 'content.write',
});

/**
 * First path segment of every admin resource.
 *
 * Shared deliberately. The API router needs it to decide which paths it owns, and
 * the website's `/api/[...path]` forwarding route needs the identical set so it
 * does not forward paths the API would only reject. Duplicating this list is how a
 * newly added resource ends up answering 404 from the browser with nothing in the
 * server logs — which is exactly what happened with `deliverables`.
 *
 * A routing concern, not an authorisation one: the API still requires a session
 * and a per-route permission behind every one of these segments.
 */
export const ADMIN_RESOURCE_PREFIXES = Object.freeze([
  'dashboard', 'company', 'employees', 'shareholders', 'clients', 'services',
  'portfolio', 'blog', 'inquiries', 'finance', 'activity', 'media',
  'testimonials', 'stats', 'jobs', 'departments', 'users', 'roles', 'tasks',
  'deliverables', 'content', 'proposals',
]);

export const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

/**
 * Role → permission map. SUPER_ADMIN is not special-cased in application code;
 * it simply holds every permission, and the seeder assigns them all explicitly
 * so the database reflects the real capability set.
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
    PERMISSIONS.ACTIVITY_READ_OWN,
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
    // Editors and admins run the production board day to day.
    PERMISSIONS.CONTENT_READ,
    PERMISSIONS.CONTENT_WRITE,
    // Editors get the task board but not deletion — removing a task is an admin action.
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
    PERMISSIONS.TASK_ASSIGN,
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
    PERMISSIONS.SOCIAL_READ,
    PERMISSIONS.SOCIAL_WRITE,
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
    PERMISSIONS.SEO_READ,
    PERMISSIONS.SEO_WRITE,
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
 * Navigation model for the admin sidebar. `permission` is used only to decide
 * whether to render the link; the API independently enforces the same check.
 */
export const ADMIN_NAV = Object.freeze([
  // Points at the dashboard rather than the bare admin prefix: there is no
  // page.js at /vira-admin, so linking there would 404, and `exact` would then
  // never match, leaving the Dashboard item unhighlighted on every page.
  { label: 'Dashboard', href: '/vira-admin/dashboard', icon: 'LayoutDashboard', permission: null, exact: true },
  /*
   * Personal work, deliberately the first thing after the dashboard rather than
   * buried in a group: an employee signs in to see what is assigned to them,
   * and that should be one click from anywhere. `permission: null` because it
   * shows the caller their *own* tasks — the API resolves the assignee from the
   * session, so there is nothing here that a permission gate would protect.
   */
  { label: 'My tasks', href: '/vira-admin/my-tasks', icon: 'ListChecks', permission: null, exact: true },
  // Internal workload, not content. Kept as its own top-level item rather than
  // inside Content so it is never mistaken for something publishable.
  {
    label: 'Tasks',
    href: '/vira-admin/tasks',
    icon: 'ListTodo',
    permission: PERMISSIONS.TASK_READ,
  },
  /*
   * The production pipeline, as its own top-level group.
   *
   * This is the module the team actually works in day to day, so it sits above the
   * publishing-oriented Content group rather than buried inside it. Putting the
   * board, the weekly report and proposals here rather than scattered through
   * Content is the fix for the discoverability problem: everything built for a
   * client workflow should be reachable from one place in the sidebar.
   */
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
      { label: 'Reports', href: '/vira-admin/finance/reports', icon: 'ChartColumn', permission: PERMISSIONS.FINANCE_READ },
    ],
  },
  {
    label: 'Team',
    icon: 'Users',
    permission: PERMISSIONS.EMPLOYEE_READ,
    children: [
      { label: 'Employees', href: '/vira-admin/employees', icon: 'UserRound', permission: PERMISSIONS.EMPLOYEE_READ },
      { label: 'Roles & permissions', href: '/vira-admin/settings/roles', icon: 'ShieldCheck', permission: PERMISSIONS.USER_READ },
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