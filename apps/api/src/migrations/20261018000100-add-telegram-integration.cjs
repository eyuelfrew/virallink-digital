'use strict';

/**
 * Telegram integration.
 *
 * Two pieces:
 *
 *  1. Identity on `users` — a Telegram chat id is the only stable handle the bot
 *     has. It is claimed through a short-lived one-time code (`telegramLinkCode`)
 *     so a person proves who they are by messaging the bot from their own account;
 *     nobody can type someone else's chat id in.
 *
 *  2. `telegram_outbox` — outbound messages are queued here first and delivered by
 *     a second step, rather than being sent inline. On shared hosting the process
 *     can be recycled between a task being assigned and the HTTP call to Telegram
 *     completing, and a notification that vanishes silently is worse than one that
 *     arrives a minute late. The queue also gives retries and an audit trail of
 *     what was sent.
 *
 * Columns are snake_case via the helpers, matching the models' `underscored: true`.
 */

const { addColumns, addIndex, columns, createTable, dropTableIfExists, removeColumn } = require('../migration-helpers/index.cjs');

const OUTBOX_STATUS = ['pending', 'sent', 'failed'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt } = columns(Sequelize);

    /* ------------------------------------------------------------------ */
    /* users: telegram identity                                            */
    /* ------------------------------------------------------------------ */
    await addColumns(queryInterface, 'users', {
      /** Telegram's numeric chat id. The permanent handle for talking to this person. */
      telegramChatId: { type: Sequelize.BIGINT, allowNull: true, defaultValue: null },
      /** @handle at link time, for display only — it can change or be removed. */
      telegramUsername: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      telegramLinkedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      /** One-time code for the /start handshake. Cleared the moment it is used. */
      telegramLinkCode: { type: Sequelize.STRING(48), allowNull: true, defaultValue: null },
      telegramLinkCodeExpiresAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      /** Per-person opt-out, so linking does not force notifications on someone. */
      telegramAlertsEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
    });

    // MySQL allows many NULLs in a unique index, so unlinked users do not collide.
    await addIndex(queryInterface, 'users', ['telegramChatId'], {
      unique: true,
      name: 'users_telegram_chat_id_unique',
    });
    await addIndex(queryInterface, 'users', ['telegramLinkCode'], {
      name: 'users_telegram_link_code_idx',
    });

    /* ------------------------------------------------------------------ */
    /* telegram_outbox: reliable outbound queue                            */
    /* ------------------------------------------------------------------ */
    await createTable(queryInterface, 'telegram_outbox', {
      id: PK,
      /** Target person. Null when a message goes to a fixed chat (announcements). */
      userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      /** Explicit chat id, used instead of userId when set. */
      chatId: { type: Sequelize.BIGINT, allowNull: true, defaultValue: null },
      /** Short event key, e.g. "task_assigned". Kept for filtering and metrics. */
      kind: { type: Sequelize.STRING(40), allowNull: false },
      /** Rendered message: { text, parseMode?, buttons? }. Rendered at enqueue time. */
      payload: { type: Sequelize.JSON, allowNull: false },
      status: { type: Sequelize.ENUM(...OUTBOX_STATUS), allowNull: false, defaultValue: 'pending' },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      lastError: { type: Sequelize.STRING(255), allowNull: true, defaultValue: null },
      sentAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      createdAt,
      updatedAt,
    });

    // The drain query: oldest pending first.
    await addIndex(queryInterface, 'telegram_outbox', ['status', 'createdAt'], {
      name: 'telegram_outbox_status_created',
    });
    await addIndex(queryInterface, 'telegram_outbox', ['userId'], {
      name: 'telegram_outbox_user_idx',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'telegram_outbox');

    await queryInterface.removeIndex('users', 'users_telegram_link_code_idx').catch(() => {});
    await queryInterface.removeIndex('users', 'users_telegram_chat_id_unique').catch(() => {});

    for (const column of [
      'telegramAlertsEnabled',
      'telegramLinkCodeExpiresAt',
      'telegramLinkCode',
      'telegramLinkedAt',
      'telegramUsername',
      'telegramChatId',
    ]) {
      await removeColumn(queryInterface, 'users', column);
    }
  },
};
