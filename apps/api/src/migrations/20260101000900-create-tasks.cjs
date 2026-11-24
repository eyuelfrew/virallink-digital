'use strict';

/**
 * Internal task board.
 *
 * tasks never appear on the public site: they can name a client, a deadline or a
 * staffing problem, so there is deliberately no public serializer for them and
 * no entry in the /public routes.
 *
 * The three optional references (assignee, client, project) are plain columns
 * rather than enforced foreign keys, and that is intentional. A task is a note
 * about work; if the client it mentions is deleted, the task should survive with
 * its text intact instead of cascading away or being blocked by the delete. The
 * model layer still joins them for display, which is enough.
 */

const {
  addIndex,
  columns,
  createTable,
  dropTableIfExists,
} = require('../migration-helpers/index.cjs');

const TASK_STATUS = ['todo', 'in_progress', 'review', 'blocked', 'done', 'cancelled'];
const TASK_PRIORITY = ['low', 'medium', 'high', 'urgent'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt } = columns(Sequelize);

    await createTable(queryInterface, 'tasks', {
      id: PK,
      title: { type: Sequelize.STRING(200), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.ENUM(...TASK_STATUS), allowNull: false, defaultValue: 'todo' },
      priority: { type: Sequelize.ENUM(...TASK_PRIORITY), allowNull: false, defaultValue: 'medium' },
      assigneeId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      clientId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      projectId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      dueDate: { type: Sequelize.DATEONLY, allowNull: true },
      /** Stamped on first move to done, so "closed this month" is a single query. */
      completedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt,
      updatedAt,
      deletedAt,
    });

    // The board's default query: open tasks, most urgent and nearest due first.
    await addIndex(queryInterface, 'tasks', ['status', 'priority'], { name: 'tasks_status_priority' });
    // "My tasks" and the per-person workload count.
    await addIndex(queryInterface, 'tasks', ['assigneeId', 'status'], { name: 'tasks_assignee_status' });
    // Overdue sweep.
    await addIndex(queryInterface, 'tasks', ['dueDate'], { name: 'tasks_due_date' });
    // Board ordering.
    await addIndex(queryInterface, 'tasks', ['createdAt'], { name: 'tasks_created_at' });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'tasks');
  },
};