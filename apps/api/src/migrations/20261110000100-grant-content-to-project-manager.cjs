'use strict';

/**
 * Grant the content production pipeline permissions to the Project Manager role.
 *
 * The Project Manager role previously lacked content.read/content.write, so
 * users with that role could not see the pipeline board, weekly report or
 * proposals even though managing them is part of the role. The permission
 * map in src/shared/permissions.js was updated; this migration back-fills the
 * role_permissions rows for databases where AUTO_SEED is off.
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`
      INSERT IGNORE INTO role_permissions (role_id, permission_id, created_at)
      SELECT r.id, p.id, NOW()
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.\`key\` = 'project_manager'
        AND p.\`key\` IN ('content.read', 'content.write')
    `);
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize;
    await sequelize.query(`
      DELETE rp FROM role_permissions rp
      INNER JOIN roles r ON r.id = rp.role_id
      INNER JOIN permissions p ON p.id = rp.permission_id
      WHERE r.\`key\` = 'project_manager'
        AND p.\`key\` IN ('content.read', 'content.write')
    `);
  },
};
