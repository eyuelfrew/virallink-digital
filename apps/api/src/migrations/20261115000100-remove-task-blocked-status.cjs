'use strict';

/**
 * Drop the "blocked" task status.
 *
 * The workflow is `todo -> in_progress -> review -> done`, with `cancelled` as
 * a terminal state. "Blocked" was never part of it: no task in the system
 * carried it, and it gave every board an empty column that pushed the columns
 * that matter off the screen.
 *
 * The column was the whole reason, so the enum change is the whole fix. The
 * boards build their columns from the status list, and the API validates a
 * status against it, so there is nothing left to carry the status around.
 *
 * A task left in "blocked" is moved to "in_progress" rather than dropped. It
 * is unfinished work, and unfinished work must not disappear because a column
 * it could live in went away.
 */

const STATUS_AFTER = ['todo', 'in_progress', 'review', 'done', 'cancelled'];
const STATUS_BEFORE = ['todo', 'in_progress', 'review', 'blocked', 'done', 'cancelled'];

module.exports = {
  async up(queryInterface) {
    /*
     * Move any task out of "blocked" first.
     *
     * The update has to happen before the column loses the value: MySQL refuses
     * to alter an enum that still has rows using the value it is dropping, and
     * in strict mode it would fail outright rather than quietly emptying the
     * column.
     */
    await queryInterface.sequelize.query(
      "UPDATE `tasks` SET `status` = 'in_progress' WHERE `status` = 'blocked'",
    );

    /*
     * MODIFY rather than CHANGE, and the full value list is written out every
     * time, because MODIFY replaces the type: listing only the values that
     * remain would drop `blocked` and rewrite every row using it.
     */
    await queryInterface.sequelize.query(
      `ALTER TABLE \`tasks\` MODIFY \`status\` ENUM(${STATUS_AFTER.map((value) => `'${value}'`).join(',')}) NOT NULL DEFAULT 'todo'`,
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE \`tasks\` MODIFY \`status\` ENUM(${STATUS_BEFORE.map((value) => `'${value}'`).join(',')}) NOT NULL DEFAULT 'todo'`,
    );
  },
};
