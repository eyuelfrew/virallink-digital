'use strict';

/**
 * Password reset tokens.
 *
 * A forgotten password is recovered by proving control of a linked Telegram
 * account: the API issues a short one-time code, the person reads it out of
 * their Telegram chat, and redeems it in the browser.
 *
 * The code itself is never stored. Only a SHA-256 digest of `userId:code` is
 * written, so a copy of the database does not hand an attacker a set of
 * working reset codes. Binding the user id into the digest means a hash copied
 * from one row into another does not verify.
 *
 * Tokens are their own table rather than three more columns on `users`, for
 * two reasons. Their lifecycle is independent of the account's — a request can
 * expire without the account changing — and the row is a record of a security
 * event worth keeping after it is spent, which a column on `users` is not.
 *
 * The second half of this migration adds `must_change_password`: a flag for
 * accounts whose password was set by somebody else, so the person who was
 * given it is forced to choose their own before using the console.
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

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt } = columns(Sequelize);

    /* ------------------------------------------------------------------ */
    /* Reset tokens                                                         */
    /* ------------------------------------------------------------------ */
    await createTable(queryInterface, 'password_reset_tokens', {
      id: PK,
      userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      /**
       * sha256(`${userId}:${code}`) as lowercase hex. Never the code itself.
       * Deliberately not unique: two accounts can be issued the same six
       * digits, and the lookup is always scoped to one account anyway.
       */
      codeHash: { type: Sequelize.STRING(64), allowNull: false },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      /** Wrong guesses charged against this code. */
      attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      /** Set when the code is redeemed, or when it runs out of attempts. */
      consumedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      /** Where the request came from, for the security log. */
      ip: { type: Sequelize.STRING(45), allowNull: true, defaultValue: null },
      createdAt,
      updatedAt,
    });

    // Lookups are always "this account's live token".
    await addIndex(queryInterface, 'password_reset_tokens', ['userId', 'createdAt'], {
      name: 'password_reset_tokens_user_created_idx',
    });
    // The send-rate limit counts a user's recent tokens.
    await addIndex(queryInterface, 'password_reset_tokens', ['userId'], {
      name: 'password_reset_tokens_user_idx',
    });
    await addConstraint(queryInterface, 'password_reset_tokens', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'password_reset_tokens_user_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });

    /* ------------------------------------------------------------------ */
    /* Forced password change                                               */
    /* ------------------------------------------------------------------ */
    await addColumns(queryInterface, 'users', {
      /**
       * Set when an administrator sets a password on somebody's behalf. The
       * account can sign in, but every other console page is refused until
       * the holder chooses a password of their own.
       */
      mustChangePassword: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    });
  },

  async down(queryInterface) {
    await removeColumn(queryInterface, 'users', 'mustChangePassword');
    await dropTableIfExists(queryInterface, 'password_reset_tokens');
  },
};
