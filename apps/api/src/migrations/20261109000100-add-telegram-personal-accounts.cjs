'use strict';

/**
 * Personal Telegram accounts and conditional auto-reply rules.
 *
 * The existing auto-reply tables describe *bots* driven by the Telegram Bot API
 * (a token and a webhook). This migration adds the second half of the feature
 * that the original standalone bot had: a person can sign in with their own
 * Telegram account (MTProto, api id / api hash / phone + login code + optional
 * 2FA password) and let that account answer chats.
 *
 * The credentials live in their own table because they belong to a person, not
 * to a bot. An auto-reply account row with provider = 'account' points at one of
 * these rows, so settings, catalog and conversations keep using the same tables
 * and the same UI for both kinds of connection.
 *
 * Reply rules are stored separately so an account can answer different chats
 * with different messages depending on the trigger: a new chat, a returning
 * chat, a keyword, an exact phrase or a regular expression.
 */

const {
  addColumns,
  addConstraint,
  addIndex,
  columns,
  createTable,
  dropTableIfExists,
  removeColumn,
} = require('../migration-helpers/index.cjs');

const ACCOUNT_STATUS = ['disconnected', 'code_sent', 'password_required', 'connected', 'error'];
const CONNECTION_STATUS = ['new', 'code_sent', 'password_required', 'connected', 'disconnected', 'error'];
const RULE_TRIGGER = ['any', 'new_chat', 'returning_chat', 'keyword', 'exact', 'regex'];

async function dropConstraintIfExists(queryInterface, tableName, name) {
  try {
    await queryInterface.removeConstraint(tableName, name);
  } catch {
    // Constraint already gone (or never created): a rollback must stay re-runnable.
  }
}

async function dropIndexIfExists(queryInterface, tableName, name) {
  try {
    await queryInterface.removeIndex(tableName, name);
  } catch {
    // Index already gone.
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt } = columns(Sequelize);

    /* ------------------------------------------------------------------ */
    /* Personal account credentials                                        */
    /* ------------------------------------------------------------------ */
    await createTable(queryInterface, 'telegram_user_accounts', {
      id: PK,
      userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      apiId: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      // Encrypted at rest by the service layer (AES-256-GCM).
      apiHash: { type: Sequelize.TEXT, allowNull: false },
      phoneNumber: { type: Sequelize.TEXT, allowNull: false },
      sessionString: { type: Sequelize.TEXT, allowNull: true },
      telegramUserId: { type: Sequelize.BIGINT, allowNull: true, defaultValue: null },
      accountFirstName: { type: Sequelize.STRING(160), allowNull: true, defaultValue: null },
      accountLastName: { type: Sequelize.STRING(160), allowNull: true, defaultValue: null },
      accountUsername: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      status: {
        type: Sequelize.ENUM(...ACCOUNT_STATUS),
        allowNull: false,
        defaultValue: 'disconnected',
      },
      lastError: { type: Sequelize.STRING(500), allowNull: true, defaultValue: null },
      lastConnectedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'telegram_user_accounts', ['userId'], {
      unique: true,
      name: 'telegram_user_accounts_user_unique',
    });
    await addConstraint(queryInterface, 'telegram_user_accounts', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'telegram_user_accounts_user_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });

    /* ------------------------------------------------------------------ */
    /* Link an auto-reply account to a personal credential row             */
    /* ------------------------------------------------------------------ */
    await queryInterface.changeColumn('telegram_auto_reply_accounts', 'provider', {
      type: Sequelize.ENUM('env', 'custom', 'account'),
      allowNull: false,
      defaultValue: 'custom',
    });

    await addColumns(queryInterface, 'telegram_auto_reply_accounts', {
      userAccountId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      telegramUserId: { type: Sequelize.BIGINT, allowNull: true, defaultValue: null },
      accountFirstName: { type: Sequelize.STRING(160), allowNull: true, defaultValue: null },
      accountLastName: { type: Sequelize.STRING(160), allowNull: true, defaultValue: null },
      accountUsername: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      connectionStatus: {
        type: Sequelize.ENUM(...CONNECTION_STATUS),
        allowNull: false,
        defaultValue: 'new',
      },
      lastLoginAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
    });

    await addIndex(queryInterface, 'telegram_auto_reply_accounts', ['userAccountId'], {
      unique: true,
      name: 'telegram_auto_reply_accounts_user_account_unique',
    });
    await addConstraint(queryInterface, 'telegram_auto_reply_accounts', {
      fields: ['userAccountId'],
      type: 'foreign key',
      name: 'telegram_auto_reply_accounts_user_account_fk',
      references: { table: 'telegram_user_accounts', field: 'id' },
      onDelete: 'CASCADE',
    });

    /* ------------------------------------------------------------------ */
    /* Conditional reply rules                                             */
    /* ------------------------------------------------------------------ */
    await createTable(queryInterface, 'telegram_auto_reply_rules', {
      id: PK,
      accountId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      trigger: {
        type: Sequelize.ENUM(...RULE_TRIGGER),
        allowNull: false,
        defaultValue: 'keyword',
      },
      // Comma/newline separated keywords, or a regular expression when
      // trigger = 'regex'. Kept as text so the rule can be edited inline.
      keywords: { type: Sequelize.TEXT, allowNull: true },
      replyText: { type: Sequelize.TEXT, allowNull: true },
      sendCatalog: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      cooldownMinutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      stopProcessing: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'telegram_auto_reply_rules', ['accountId', 'isActive', 'priority'], {
      name: 'telegram_rules_account_active_priority_idx',
    });
    await addConstraint(queryInterface, 'telegram_auto_reply_rules', {
      fields: ['accountId'],
      type: 'foreign key',
      name: 'telegram_rules_account_fk',
      references: { table: 'telegram_auto_reply_accounts', field: 'id' },
      onDelete: 'CASCADE',
    });

    /* ------------------------------------------------------------------ */
    /* Per-chat controls                                                   */
    /* ------------------------------------------------------------------ */
    await addColumns(queryInterface, 'telegram_auto_reply_conversations', {
      autoReplyEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      lastRuleId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      lastRuleReplyAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
    });
  },

  async down(queryInterface, Sequelize) {
    await removeColumn(queryInterface, 'telegram_auto_reply_conversations', 'lastRuleReplyAt');
    await removeColumn(queryInterface, 'telegram_auto_reply_conversations', 'lastRuleId');
    await removeColumn(queryInterface, 'telegram_auto_reply_conversations', 'autoReplyEnabled');

    await dropTableIfExists(queryInterface, 'telegram_auto_reply_rules');

    await dropConstraintIfExists(queryInterface, 'telegram_auto_reply_accounts', 'telegram_auto_reply_accounts_user_account_fk');
    await dropIndexIfExists(queryInterface, 'telegram_auto_reply_accounts', 'telegram_auto_reply_accounts_user_account_unique');
    for (const column of [
      'lastLoginAt',
      'connectionStatus',
      'accountUsername',
      'accountLastName',
      'accountFirstName',
      'telegramUserId',
      'userAccountId',
    ]) {
      await removeColumn(queryInterface, 'telegram_auto_reply_accounts', column);
    }

    // Remove personal-account rows before narrowing the enum, otherwise MySQL
    // would coerce or reject the existing values.
    await queryInterface.sequelize.query(
      "DELETE FROM `telegram_auto_reply_accounts` WHERE `provider` = 'account'",
    );
    await queryInterface.changeColumn('telegram_auto_reply_accounts', 'provider', {
      type: Sequelize.ENUM('env', 'custom'),
      allowNull: false,
      defaultValue: 'custom',
    });

    await dropTableIfExists(queryInterface, 'telegram_user_accounts');
  },
};
