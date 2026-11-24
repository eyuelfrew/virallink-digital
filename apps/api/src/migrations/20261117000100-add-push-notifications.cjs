'use strict';

/**
 * Push notification tokens and outbox.
 *
 * A user can sign in on several devices, so tokens are stored one row per
 * (user, device). The token itself is unique: the same device re-registering
 * updates the row rather than creating a duplicate.
 *
 * The outbox follows the same pattern as the Telegram outbox: producing a
 * notification only writes a row, delivery happens here and can be retried, and
 * a cron drain picks up whatever is left. Push delivery is best-effort and must
 * never fail the action that triggered it.
 */

const {
  addIndex,
  columns,
  createTable,
  dropTableIfExists,
} = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt } = columns(Sequelize);

    await createTable(queryInterface, 'push_tokens', {
      id: PK,
      userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      token: { type: Sequelize.STRING(512), allowNull: false },
      platform: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'android' },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'push_tokens', ['token'], {
      unique: true,
      name: 'push_tokens_token_unique',
    });

    await addIndex(queryInterface, 'push_tokens', ['userId'], {
      name: 'push_tokens_user_idx',
    });

    await createTable(queryInterface, 'push_outbox', {
      id: PK,
      userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      kind: { type: Sequelize.STRING(60), allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'sent', 'failed'), allowNull: false, defaultValue: 'pending' },
      attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      lastError: { type: Sequelize.STRING(250), allowNull: true, defaultValue: null },
      sentAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'push_outbox', ['status', 'createdAt'], {
      name: 'push_outbox_status_created_idx',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'push_outbox');
    await dropTableIfExists(queryInterface, 'push_tokens');
  },
};
