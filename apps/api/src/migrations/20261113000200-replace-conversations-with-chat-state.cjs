'use strict';

/**
 * Replace the conversation table with per-chat state.
 *
 * The auto-reply used to keep a transcript: what each client wrote, their
 * name, their username, the chat title, message counts and a history of every
 * exchange. None of it is needed to run an auto-reply — the only things the
 * feature actually uses are a few timestamps (the away cooldown, a rule's
 * cooldown, the gap between two replies), two per-chat switches, and
 * Telegram's own message id so a retried webhook is not answered twice.
 *
 * So the table becomes `telegram_auto_reply_chat_state`: one small row per
 * chat, no content. The state that already exists is carried across, so no
 * cooldown restarts and no chat loses its block.
 *
 * What is dropped: `last_message_text`, `title`, `username`, `first_name`,
 * `last_name`, `chat_type`, `message_count`, `reply_count`, `first_message_at`
 * and `last_message_at`.
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

    await createTable(queryInterface, 'telegram_auto_reply_chat_state', {
      id: PK,
      accountId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      chatId: { type: Sequelize.BIGINT, allowNull: false },
      /** A sequence number, not content: it stops a retried update being answered twice. */
      lastTelegramMessageId: { type: Sequelize.BIGINT, allowNull: true, defaultValue: null },
      lastReplyAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      lastAwayReplyAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      lastRuleId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      lastRuleReplyAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      isBlocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      autoReplyEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'telegram_auto_reply_chat_state', ['accountId', 'chatId'], {
      unique: true,
      name: 'telegram_chat_state_account_chat_unique',
    });

    await addIndex(queryInterface, 'telegram_auto_reply_chat_state', ['accountId', 'isBlocked'], {
      name: 'telegram_chat_state_account_blocked_idx',
    });

    /*
     * Carry the state across.
     *
     * The old table is dropped afterwards, so its content goes with it — that
     * is the point of this migration. Only the columns the auto-reply still
     * uses are copied.
     */
    await queryInterface.sequelize.query(
      `INSERT INTO telegram_auto_reply_chat_state
         (account_id, chat_id, last_telegram_message_id, last_reply_at, last_away_reply_at,
          last_rule_id, last_rule_reply_at, is_blocked, auto_reply_enabled, created_at, updated_at)
       SELECT account_id, chat_id, last_telegram_message_id, last_reply_at, last_away_reply_at,
              last_rule_id, last_rule_reply_at, is_blocked, auto_reply_enabled, created_at, updated_at
       FROM telegram_auto_reply_conversations`,
    );

    await dropTableIfExists(queryInterface, 'telegram_auto_reply_conversations');
  },

  async down(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt } = columns(Sequelize);

    await createTable(queryInterface, 'telegram_auto_reply_conversations', {
      id: PK,
      accountId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      chatId: { type: Sequelize.BIGINT, allowNull: false },
      chatType: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'private' },
      title: { type: Sequelize.STRING(191), allowNull: true, defaultValue: null },
      username: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      firstName: { type: Sequelize.STRING(120), allowNull: true, defaultValue: null },
      lastName: { type: Sequelize.STRING(120), allowNull: true, defaultValue: null },
      lastMessageText: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      lastTelegramMessageId: { type: Sequelize.BIGINT, allowNull: true, defaultValue: null },
      messageCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      replyCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      firstMessageAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      lastMessageAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      lastReplyAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      lastAwayReplyAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      lastRuleId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      lastRuleReplyAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      isBlocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      autoReplyEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'telegram_auto_reply_conversations', ['accountId', 'chatId'], {
      unique: true,
      name: 'telegram_conversations_account_chat_unique',
    });

    await queryInterface.sequelize.query(
      `INSERT INTO telegram_auto_reply_conversations
         (account_id, chat_id, last_telegram_message_id, last_reply_at, last_away_reply_at,
          last_rule_id, last_rule_reply_at, is_blocked, auto_reply_enabled, created_at, updated_at)
       SELECT account_id, chat_id, last_telegram_message_id, last_reply_at, last_away_reply_at,
              last_rule_id, last_rule_reply_at, is_blocked, auto_reply_enabled, created_at, updated_at
       FROM telegram_auto_reply_chat_state`,
    );

    await dropTableIfExists(queryInterface, 'telegram_auto_reply_chat_state');
  },
};
