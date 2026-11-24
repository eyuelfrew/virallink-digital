'use strict';

/**
 * Add role column to users and assigneeUserId to tasks.
 *
 * This migration supports the new granular role system:
 * - Users get a `role` column to assign granular permissions (SOFTWARE_ENGINEER, VIDEO_EDITOR, etc.)
 * - Tasks can now be assigned to Users directly via `assigneeUserId` (in addition to Employee via assigneeId)
 */

const { addColumns, addConstraint, addIndex, removeColumn } = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add role column to users
    await addColumns(queryInterface, 'users', {
      role: { type: Sequelize.STRING(60), allowNull: true, defaultValue: null },
    });

    // Add assigneeUserId to tasks
    await addColumns(queryInterface, 'tasks', {
      assigneeUserId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
    });

    // Add foreign key constraint for assigneeUserId
    await addConstraint(queryInterface, 'tasks', {
      fields: ['assigneeUserId'],
      type: 'foreign key',
      name: 'tasks_assigneeUserId_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    // Index for "my tasks" queries
    await addIndex(queryInterface, 'tasks', ['assigneeUserId'], { name: 'tasks_assigneeUserId_idx' });

    // Index for role-based queries
    await addIndex(queryInterface, 'users', ['role'], { name: 'users_role_idx' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface
      .removeConstraint('tasks', 'tasks_assigneeUserId_fk')
      .catch(() => {});
    await removeColumn(queryInterface, 'tasks', 'assigneeUserId');
    await queryInterface
      .removeConstraint('users', 'users_role_fk')
      .catch(() => {});
    await removeColumn(queryInterface, 'users', 'role');
    await queryInterface.removeIndex('tasks', 'tasks_assigneeUserId_idx').catch(() => {});
    await queryInterface.removeIndex('users', 'users_role_idx').catch(() => {});
  },
};