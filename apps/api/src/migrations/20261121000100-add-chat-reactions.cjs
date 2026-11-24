'use strict';

/**
 * Emoji reactions on chat messages.
 *
 * A reaction is one (message, user, emoji) row. The unique index makes "same
 * emoji, same person" the natural no-op, and deleting a message cascades its
 * reactions away.
 *
 * Read receipts already use the existing `conversation_members.last_read_message_id`
 * cursor; reactions are separate — a message can be read and also reacted to,
 * and we do not want one to overwrite the other.
 */

const {
  columns,
  createTable,
  addColumn,
  addIndex,
  addConstraint,
  dropTableIfExists,
} = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt } = columns(Sequelize);

    await addColumn(queryInterface, 'conversations', {
      pinnedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
    });

    await createTable(queryInterface, 'message_reactions', {
      id: PK,
      messageId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      emoji: { type: Sequelize.STRING(40), allowNull: false },
      createdAt,
      updatedAt,
    });

    await addConstraint(queryInterface, 'message_reactions', {
      fields: ['messageId'],
      type: 'foreign key',
      name: 'message_reactions_message_id_fk',
      references: { table: 'messages', field: 'id' },
      onDelete: 'CASCADE',
    });
    await addConstraint(queryInterface, 'message_reactions', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'message_reactions_user_id_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });

    await addIndex(queryInterface, 'message_reactions', ['messageId', 'userId', 'emoji'], {
      unique: true,
      name: 'message_reactions_message_user_emoji_unique',
    });
    await addIndex(queryInterface, 'message_reactions', ['messageId'], {
      name: 'message_reactions_message_idx',
    });
    await addIndex(queryInterface, 'message_reactions', ['userId'], {
      name: 'message_reactions_user_idx',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'message_reactions');
  },
};
