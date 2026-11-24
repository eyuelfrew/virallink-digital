'use strict';

/**
 * User chat — persistent private and group conversations.
 *
 * Three tables:
 *  - `conversations` — a private pair or a titled group.
 *  - `conversation_members` — one row per participant, with a per-member
 *    `last_read_message_id` cursor that drives the unread badge.
 *  - `messages` — the thread. Soft-deleted via `deleted_at` so history stays
 *    (audit-friendly) while the UI hides it.
 *
 * All three are paranoid (soft-deleted) to match the rest of the schema.
 */

const {
  columns,
  createTable,
  addIndex,
  addConstraint,
  dropTableIfExists,
} = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop-first: `createTable` is not idempotent, and a failed earlier run
    // leaves partial tables behind (MySQL DDL commits immediately). No data
    // exists in these tables yet — dropping restores a clean slate.
    await dropTableIfExists(queryInterface, 'messages');
    await dropTableIfExists(queryInterface, 'conversation_members');
    await dropTableIfExists(queryInterface, 'conversations');

    const { PK, createdAt, updatedAt, deletedAt } = columns(Sequelize);

    await createTable(
      queryInterface,
      'conversations',
      {
        id: PK,
        isGroup: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        title: { type: Sequelize.STRING(191), allowNull: true, defaultValue: null },
        creatorId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
        lastMessageAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    await createTable(
      queryInterface,
      'conversation_members',
      {
        id: PK,
        conversationId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        isMuted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        lastReadMessageId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    await createTable(
      queryInterface,
      'messages',
      {
        id: PK,
        conversationId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        text: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
        replyToId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
        editedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    // ---- Foreign keys (names in the MySQL style the other migrations use).
    await addConstraint(queryInterface, 'conversations', {
      fields: ['creatorId'],
      type: 'foreign key',
      name: 'conversations_creator_id_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });

    await addConstraint(queryInterface, 'conversation_members', {
      fields: ['conversationId'],
      type: 'foreign key',
      name: 'conversation_members_conversation_id_fk',
      references: { table: 'conversations', field: 'id' },
      onDelete: 'CASCADE',
    });
    await addConstraint(queryInterface, 'conversation_members', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'conversation_members_user_id_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });

    await addConstraint(queryInterface, 'messages', {
      fields: ['conversationId'],
      type: 'foreign key',
      name: 'messages_conversation_id_fk',
      references: { table: 'conversations', field: 'id' },
      onDelete: 'CASCADE',
    });
    await addConstraint(queryInterface, 'messages', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'messages_user_id_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
    await addConstraint(queryInterface, 'messages', {
      fields: ['replyToId'],
      type: 'foreign key',
      name: 'messages_reply_to_id_fk',
      references: { table: 'messages', field: 'id' },
      onDelete: 'SET NULL',
    });

    // ---- Indexes (same shapes the models declare in definitions.js).
    await addIndex(queryInterface, 'conversations', ['isGroup'], {});
    await addIndex(queryInterface, 'conversations', ['lastMessageAt'], { name: 'conversations_last_message_at_idx' });

    await addIndex(queryInterface, 'conversation_members', ['conversationId', 'userId'], {
      unique: true,
      name: 'conversation_members_pair_unique',
    });
    await addIndex(queryInterface, 'conversation_members', ['userId'], { name: 'conversation_members_user_idx' });

    await addIndex(queryInterface, 'messages', ['conversationId', 'createdAt'], { name: 'messages_conversation_created_idx' });
    await addIndex(queryInterface, 'messages', ['userId'], { name: 'messages_user_idx' });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'messages');
    await dropTableIfExists(queryInterface, 'conversation_members');
    await dropTableIfExists(queryInterface, 'conversations');
  },
};
