'use strict';

/**
 * Telegram delivery for password resets.
 *
 * A bot cannot message a chat that has never spoken to it. So for an account
 * with no linked chat there is no way to *send* a code — the only thing that
 * can work is giving the person a link that starts the bot, and having the bot
 * reply with the code.
 *
 * This migration adds what that needs:
 *
 *   - `delivery_token_hash`, the one-time secret carried in that link. It is
 *     hashed at rest, like the code itself, so a copy of the database does not
 *     hand out working links.
 *   - `delivered_at` and `delivery_chat_id`, so a link is good once and the
 *     chat that redeemed it is known.
 *
 * `code_hash` becomes nullable because in this flow the code does not exist
 * until the link is opened. Generating it at request time and storing only its
 * digest would leave the bot unable to send it.
 */

const {
  addColumns,
  addIndex,
  columns,
} = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const { createdAt, updatedAt } = columns(Sequelize);

    /*
     * The code is created at the moment the link is opened rather than at the
     * moment the reset is requested, so the digest cannot be required here.
     */
    await queryInterface.changeColumn('password_reset_tokens', 'code_hash', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });

    await addColumns(queryInterface, 'password_reset_tokens', {
      /**
       * sha256 of the one-time token carried in the deep link. Hashing it means
       * the link in a browser history, a proxy log or a screenshot cannot be
       * replayed against the database.
       */
      deliveryTokenHash: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      /** Set when the link has been opened and the code sent. */
      deliveredAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      /** The chat the code was delivered to. */
      deliveryChatId: { type: Sequelize.BIGINT, allowNull: true, defaultValue: null },
    });

    await addIndex(queryInterface, 'password_reset_tokens', ['deliveryTokenHash'], {
      name: 'password_reset_tokens_delivery_hash_idx',
    });
  },

  async down(queryInterface, Sequelize) {
    // The column goes back to NOT NULL only if every row has a code. Rows
    // created by the delivery flow have none until the link is opened, so a
    // rollback removes those rows first rather than failing on the constraint.
    await queryInterface.sequelize.query(
      'DELETE FROM `password_reset_tokens` WHERE `code_hash` IS NULL',
    );

    await queryInterface.changeColumn('password_reset_tokens', 'code_hash', {
      type: Sequelize.STRING(64),
      allowNull: false,
    });
  },
};
