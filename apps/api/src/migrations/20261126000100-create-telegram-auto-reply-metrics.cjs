'use strict';

/**
 * Aggregate auto-reply metrics.
 *
 * Business analytics without a transcript: one row per account, day, outcome
 * category and rule. There is no chat id, no sender id, no username and no
 * message text here — only counts. The purpose is to answer "which rules are
 * used, how many conversations got an answer, and how many stayed quiet", not
 * to reconstruct what anybody said.
 *
 * `ruleId = 0` means "no rule" so the unique index stays usable in MySQL, where
 * a nullable column would allow many duplicate rows for the same day.
 */

const { addIndex, columns, createTable, dropTableIfExists } = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt } = columns(Sequelize);

    await createTable(queryInterface, 'telegram_auto_reply_metrics', {
      id: PK,
      accountId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      bucketDate: { type: Sequelize.DATEONLY, allowNull: false },
      category: { type: Sequelize.STRING(32), allowNull: false },
      ruleId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
      eventCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      sentCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      createdAt,
      updatedAt,
    });

    await addIndex(
      queryInterface,
      'telegram_auto_reply_metrics',
      ['accountId', 'bucketDate', 'category', 'ruleId'],
      { unique: true, name: 'telegram_metrics_account_day_category_rule_unique' },
    );

    await addIndex(queryInterface, 'telegram_auto_reply_metrics', ['accountId', 'bucketDate'], {
      name: 'telegram_metrics_account_day_idx',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'telegram_auto_reply_metrics');
  },
};
