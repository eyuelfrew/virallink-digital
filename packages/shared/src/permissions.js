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
});

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
    PERMISSIONS.MEDIA_READ,
    PERMISSIONS.ACTIVITY_READ,
  ],
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.SUPER_ADMIN]: 'Super admin',
  [ROLES.ADMIN]: 'Administrator',
  [ROLES.EDITOR]: 'Content editor',
  [ROLES.FINANCE]: 'Finance',
});

/**
 * Navigation model for the admin sidebar. `permission` is used only to decide
 * whether to render the link; the API independently enforces the same check.
 */
export const ADMIN_NAV = Object.freeze([
  { label: 'Dashboard', href: '/admin-teftef', icon: 'LayoutDashboard', permission: null, exact: true },
  {
    label: 'Content',
    icon: 'FileStack',
    permission: null,
    children: [
      { label: 'Services', href: '/admin-teftef/services', icon: 'Briefcase', permission: PERMISSIONS.SERVICE_READ },
      { label: 'Portfolio', href: '/admin-teftef/portfolio', icon: 'FolderKanban', permission: PERMISSIONS.PROJECT_READ },
      { label: 'Blog', href: '/admin-teftef/blog', icon: 'Newspaper', permission: PERMISSIONS.BLOG_READ },
      { label: 'Inquiries', href: '/admin-teftef/inquiries', icon: 'Inbox', permission: PERMISSIONS.INQUIRY_READ },
    ],
  },
  {
    label: 'People',
    icon: 'Users',
    permission: null,
    children: [
      { label: 'Employees', href: '/admin-teftef/employees', icon: 'UserRound', permission: PERMISSIONS.EMPLOYEE_READ },
      { label: 'Clients', href: '/admin-teftef/clients', icon: 'Building2', permission: PERMISSIONS.CLIENT_READ },
      { label: 'Shareholders', href: '/admin-teftef/shareholders', icon: 'PieChart', permission: PERMISSIONS.SHAREHOLDER_READ },
    ],
  },
  {
    label: 'Finance',
    icon: 'Wallet',
    permission: PERMISSIONS.FINANCE_READ,
    children: [
      { label: 'Transactions', href: '/admin-teftef/finance/transactions', icon: 'ArrowLeftRight', permission: PERMISSIONS.FINANCE_READ },
      { label: 'Invoices', href: '/admin-teftef/finance/invoices', icon: 'ReceiptText', permission: PERMISSIONS.FINANCE_READ },
      { label: 'Reports', href: '/admin-teftef/finance/reports', icon: 'ChartColumn', permission: PERMISSIONS.FINANCE_READ },
    ],
  },
  {
    label: 'System',
    icon: 'Settings',
    permission: PERMISSIONS.SETTINGS_READ,
    children: [
      { label: 'Company', href: '/admin-teftef/settings/company', icon: 'Building', permission: PERMISSIONS.COMPANY_READ },
      { label: 'Media', href: '/admin-teftef/settings/media', icon: 'Image', permission: PERMISSIONS.MEDIA_READ },
      { label: 'Users & roles', href: '/admin-teftef/settings/users', icon: 'ShieldCheck', permission: PERMISSIONS.USER_READ },
      { label: 'Activity log', href: '/admin-teftef/activity', icon: 'History', permission: PERMISSIONS.ACTIVITY_READ },
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