'use strict';

/**
 * Make the push outbox double as a notification inbox.
 *
 * `read_at` records when the recipient opened a notification. NULL means
 * unread. The column is nullable and defaults to NULL, so existing rows stay
 * unread — the recipient sees them the next time they open the inbox.
 */

const {
  columns,
} = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `push_outbox` ADD COLUMN `read_at` DATETIME NULL DEFAULT NULL AFTER `sent_at`",
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE `push_outbox` ADD INDEX `push_outbox_user_read_idx` (`user_id`, `read_at`)",
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("ALTER TABLE `push_outbox` DROP INDEX `push_outbox_user_read_idx`").catch(() => {});
    await queryInterface.sequelize.query("ALTER TABLE `push_outbox` DROP COLUMN `read_at`").catch(() => {});
  },
};
