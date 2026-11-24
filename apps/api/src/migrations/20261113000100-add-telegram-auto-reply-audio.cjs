'use strict';

/**
 * Audio replies for the Telegram auto-reply.
 *
 * Two changes:
 *
 *   1. `media.kind` gains an `audio` value, so the media library can hold the
 *      voice messages and sound bites the auto-reply sends. The column is a
 *      MySQL ENUM, so the values live in the type itself and have to be
 *      changed there — adding a row with a kind the type does not have is not
 *      possible.
 *
 *   2. `telegram_auto_reply_rules` gains `audio_media_id`: the single audio
 *      file a rule sends after its reply text. One file rather than a list,
 *      because a rule that replies with a wall of audio is not an auto-reply
 *      any more.
 *
 * Both are additive: existing rows keep their values, and the new column is
 * null until an administrator picks a file.
 */

const {
  addColumn,
  addConstraint,
  addIndex,
  columns,
  removeColumn,
} = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK } = columns(Sequelize);

    /*
     * The ENUM gains a value.
     *
     * MODIFY rather than CHANGE, and the full value list is written out every
     * time, because MODIFY replaces the type: listing only the new value would
     * drop `video`, `document` and `svg` and every row using them would be
     * rewritten to the default.
     */
    await queryInterface.sequelize.query(
      "ALTER TABLE `media` MODIFY `kind` ENUM('image','video','document','svg','audio') NOT NULL DEFAULT 'image'",
    );

    await addColumn(queryInterface, 'telegram_auto_reply_rules', {
      audioMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
    });

    await addIndex(queryInterface, 'telegram_auto_reply_rules', ['audioMediaId'], {
      name: 'telegram_auto_reply_rules_audio_idx',
    });

    await addConstraint(queryInterface, 'telegram_auto_reply_rules', {
      fields: ['audioMediaId'],
      type: 'foreign key',
      name: 'telegram_auto_reply_rules_audio_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });

    void PK;
  },

  async down(queryInterface) {
    await removeColumn(queryInterface, 'telegram_auto_reply_rules', 'audioMediaId');

    await queryInterface.sequelize.query(
      "ALTER TABLE `media` MODIFY `kind` ENUM('image','video','document','svg') NOT NULL DEFAULT 'image'",
    );
  },
};
