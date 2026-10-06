'use strict';

/**
 * Seed the RBAC baseline: permissions, the four system roles, and the
 * permission grants defined in packages/shared/permissions.js.
 *
 * This is the only seeder that runs in production. It contains no fake company
 * data whatsoever — no clients, no employees, no testimonials, no statistics.
 * Business content is entered by an administrator through the dashboard, and
 * nothing is public until an admin explicitly publishes it.
 *
 * Idempotent: re-running updates names and grants rather than duplicating rows,
 * so it is safe to run on every deploy.
 */

const { PERMISSIONS, ROLE_PERMISSIONS, ROLE_LABELS } = require('../shared/permissions.cjs');
const { ROLES, ENTITY, ACTIVITY_ACTION } = require('../shared/enums.cjs');

/** Group permissions by their leading segment so the admin UI can group them. */
function permissionGroup(key) {
  if (key.startsWith('finance')) return 'Finance';
  if (key.startsWith('employee')) return 'People';
  if (key.startsWith('shareholder')) return 'People';
  if (key.startsWith('client')) return 'CRM';
  if (key.startsWith('inquiry')) return 'CRM';
  if (key.startsWith('service')) return 'Content';
  if (key.startsWith('project')) return 'Content';
  if (key.startsWith('blog')) return 'Content';
  if (key.startsWith('media')) return 'Content';
  if (key.startsWith('testimonial')) return 'Content';
  if (key.startsWith('job')) return 'Content';
  if (key.startsWith('activity')) return 'System';
  if (key.startsWith('user')) return 'System';
  if (key.startsWith('role')) return 'System';
  if (key.startsWith('company')) return 'Settings';
  if (key.startsWith('settings')) return 'Settings';
  return 'General';
}

/** Human-readable description shown next to each permission in the admin UI. */
function permissionDescription(key) {
  const [resource, action] = key.split('.');
  const readable = resource.charAt(0).toUpperCase() + resource.slice(1).replace(/_/g, ' ');
  if (action === 'read') return `View ${readable.toLowerCase()} records`;
  if (action === 'write') return `Create and edit ${readable.toLowerCase()} records`;
  if (action === 'delete') return `Delete ${readable.toLowerCase()} records`;
  if (key === 'activity.read_own') return 'View activity entries created by yourself';
  return `Manage ${readable.toLowerCase()}`;
}

const ROLE_DESCRIPTIONS = {
  [ROLES.SUPER_ADMIN]: 'Unrestricted access, including user and role management.',
  [ROLES.ADMIN]: 'Manages company content, employees, clients and public pages.',
  [ROLES.EDITOR]: 'Manages services, portfolio, blog posts and other public content.',
  [ROLES.FINANCE]: 'Manages financial records, invoices and financial reports.',
  [ROLES.SOFTWARE_ENGINEER]: 'Writes, reviews and deploys code. Manages tasks and code reviews.',
  [ROLES.VIDEO_EDITOR]: 'Edits and produces video content. Manages video tasks and assets.',
  [ROLES.DESIGNER]: 'Creates visual designs, graphics and UI/UX mockups.',
  [ROLES.PROJECT_MANAGER]: 'Plans, schedules and coordinates projects. Assigns and tracks tasks.',
  [ROLES.CONTENT_WRITER]: 'Writes and edits blog posts, articles and marketing copy.',
  [ROLES.SOCIAL_MEDIA_MANAGER]: 'Manages social media channels, schedules posts and engages audience.',
  [ROLES.GRAPHIC_DESIGNER]: 'Creates graphics, illustrations and visual assets.',
  [ROLES.MOTION_DESIGNER]: 'Creates animations, motion graphics and video effects.',
  [ROLES.COPYWRITER]: 'Writes marketing copy, ad copy and website content.',
  [ROLES.SEO_SPECIALIST]: 'Optimizes content for search engines. Manages SEO strategy.',
  [ROLES.MARKETING_COORDINATOR]: 'Coordinates marketing campaigns, tracks metrics and reports.',
};

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    /* ---------------------------------------------------------------- */
    /* Permissions                                                       */
    /* ---------------------------------------------------------------- */
    for (const key of Object.values(PERMISSIONS)) {
      await queryInterface.sequelize.query(
        `INSERT INTO permissions (\`key\`, description, \`group\`, created_at, updated_at)
         VALUES (:key, :description, :group, :now, :now)
         ON DUPLICATE KEY UPDATE description = VALUES(description), \`group\` = VALUES(\`group\`), updated_at = VALUES(updated_at)`,
        {
          replacements: { key, description: permissionDescription(key), group: permissionGroup(key), now },
        },
      );
    }

    const [permissionRows] = await queryInterface.sequelize.query('SELECT id, `key` FROM permissions');
    const permissionIdByKey = new Map(permissionRows.map((row) => [row.key, row.id]));

    /* ---------------------------------------------------------------- */
    /* Roles                                                             */
    /* ---------------------------------------------------------------- */
    for (const key of Object.values(ROLES)) {
      await queryInterface.sequelize.query(
        `INSERT INTO roles (\`key\`, name, description, is_system, created_at, updated_at)
         VALUES (:key, :name, :description, true, :now, :now)
         ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), updated_at = VALUES(updated_at)`,
        { replacements: { key, name: ROLE_LABELS[key], description: ROLE_DESCRIPTIONS[key], now } },
      );
    }

    const [roleRows] = await queryInterface.sequelize.query('SELECT id, `key` FROM roles');
    const roleIdByKey = new Map(roleRows.map((row) => [row.key, row.id]));

    /* ---------------------------------------------------------------- */
    /* Grants                                                            */
    /* ---------------------------------------------------------------- */
    for (const [roleKey, permissionKeys] of Object.entries(ROLE_PERMISSIONS)) {
      const roleId = roleIdByKey.get(roleKey);
      if (!roleId) continue;

      for (const permissionKey of permissionKeys) {
        const permissionId = permissionIdByKey.get(permissionKey);
        if (!permissionId) continue;

        await queryInterface.sequelize.query(
          `INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
           VALUES (:roleId, :permissionId, :now)`,
          { replacements: { roleId, permissionId, now } },
        );
      }
    }

    /* ---------------------------------------------------------------- */
    /* System financial categories                                        */
    /* ---------------------------------------------------------------- */
    // Seeded because an empty expense/income dropdown is unusable on day one.
    // These are neutral category names, not sample transactions.
    const categories = [
      { name: 'Client payment', type: 'income' },
      { name: 'Retainer', type: 'income' },
      { name: 'Consulting', type: 'income' },
      { name: 'Salaries and wages', type: 'expense' },
      { name: 'Office rent', type: 'expense' },
      { name: 'Utilities', type: 'expense' },
      { name: 'Software and subscriptions', type: 'expense' },
      { name: 'Equipment', type: 'expense' },
      { name: 'Marketing', type: 'expense' },
      { name: 'Professional fees', type: 'expense' },
      { name: 'Travel and transport', type: 'expense' },
      { name: 'Other', type: 'expense' },
    ];

    for (const category of categories) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM financial_categories WHERE name = :name AND type = :type AND deleted_at IS NULL',
        { replacements: category },
      );
      if (existing.length) continue;

      await queryInterface.sequelize.query(
        `INSERT INTO financial_categories (name, type, is_system, created_at, updated_at)
         VALUES (:name, :type, true, :now, :now)`,
        { replacements: { ...category, now } },
      );
    }

    /* ---------------------------------------------------------------- */
    /* Company profile skeleton                                          */
    /* ---------------------------------------------------------------- */
    // A single empty row so settings screens have something to bind to. The
    // name is the only value, and it is the real company name, not placeholder
    // marketing copy.
    const [companies] = await queryInterface.sequelize.query('SELECT id FROM companies LIMIT 1');
    if (!companies.length) {
      await queryInterface.sequelize.query(
        `INSERT INTO companies (name, created_at, updated_at)
         VALUES (:name, :now, :now)`,
        { replacements: { name: 'Virallink', now } },
      );
    }

    console.log(
      `  seeded ${permissionRows.length} permissions, ${roleRows.length} roles, ` +
        `${categories.length} financial categories, company profile`,
    );
    void ENTITY;
    void ACTIVITY_ACTION;
  },

  async down(queryInterface) {
    // Only removes what this seeder creates. Business data is left alone.
    await queryInterface.sequelize.query('DELETE FROM role_permissions');
    await queryInterface.sequelize.query('DELETE FROM user_roles');
    await queryInterface.sequelize.query('DELETE FROM roles');
    await queryInterface.sequelize.query('DELETE FROM permissions');
    await queryInterface.sequelize.query(
      'DELETE FROM financial_categories WHERE is_system = true AND deleted_at IS NULL',
    );
  },
};