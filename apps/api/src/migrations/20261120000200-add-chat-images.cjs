'use strict';

/**
 * Chat image messages.
 *
 * A message may now carry one image, stored in the existing media table. The
 * message keeps only the media id; the file itself lives in the storage driver,
 * so deleting a message can clean up an image nothing else points at.
 *
 * The column is nullable, so every text-only message written before this
 * migration keeps working unchanged.
 */

const {
  addColumn,
  addConstraint,
  addIndex,
  removeColumn,
} = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    await addColumn(queryInterface, 'messages', {
      imageMediaId: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        defaultValue: null,
      },
    });

    await addConstraint(queryInterface, 'messages', {
      fields: ['imageMediaId'],
      type: 'foreign key',
      name: 'messages_image_media_id_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });

    await addIndex(queryInterface, 'messages', ['imageMediaId'], {
      name: 'messages_image_media_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface
      .removeConstraint('messages', 'messages_image_media_id_fk')
      .catch(() => {});
    await queryInterface
      .removeIndex('messages', 'messages_image_media_id_idx')
      .catch(() => {});
    await removeColumn(queryInterface, 'messages', 'imageMediaId');
  },
};
