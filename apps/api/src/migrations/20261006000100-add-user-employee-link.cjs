'use strict';

/**
 * Link a sign-in account to an employee record.
 *
 * The two tables answered different questions and grew apart: `users` is "who
 * may sign in", `employees` is "who works here" (and is what tasks are assigned
 * to via tasks.assignee_id). Without this link a person could log in and have no
 * way to see the work assigned to them — the "My tasks" view has to resolve
 * session -> employee, and there was nothing to resolve against.
 *
 * Nullable on purpose: administrators and service accounts are users with no
 * employee record, and forcing a link would make the users screen unusable for
 * them. ON DELETE SET NULL matches that: deleting an employee profile must not
 * delete the sign-in account that happens to point at it.
 */

const { addColumns, addConstraint, addIndex, removeColumn } = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumns(queryInterface, 'users', {
      employeeId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
    });

    // "Show me my tasks" is a lookup on this column; the index in
    // create-tasks (assigneeId, status) serves the same query from the other end.
    await addIndex(queryInterface, 'users', ['employeeId'], { name: 'users_employee_idx' });

    await addConstraint(queryInterface, 'users', {
      fields: ['employeeId'],
      type: 'foreign key',
      name: 'users_employee_fk',
      references: { table: 'employees', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    // Tolerate a partial rollback: constraint first, then the column.
    await queryInterface
      .removeConstraint('users', 'users_employee_fk')
      .catch(() => {});
    await removeColumn(queryInterface, 'users', 'employeeId');
  },
};
