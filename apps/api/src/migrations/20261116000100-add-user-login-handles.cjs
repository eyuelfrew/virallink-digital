'use strict';

/**
 * Optional sign-in handles: username and phone.
 *
 * Email is no longer the only way to reach an account. An account can now be
 * identified by an email address, a username (Telegram-style handle) or a
 * phone number, and any one of them is enough to sign in. Email becomes
 * nullable because a person who never wanted an email address can be given a
 * username or a phone number instead.
 *
 * Each handle is unique where set. MySQL treats NULL as distinct in a unique
 * index, so many accounts can share "no email" (or "no username", or "no
 * phone") without colliding.
 *
 * The application layer enforces "at least one handle" — the database cannot
 * express that cleanly across three nullable columns, and a CHECK constraint
 * would be MySQL-version dependent.
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE `users` MODIFY `email` VARCHAR(191) NULL",
    );

    await queryInterface.sequelize.query(
      "ALTER TABLE `users` ADD COLUMN `username` VARCHAR(64) NULL AFTER `email`",
    );

    await queryInterface.sequelize.query(
      "ALTER TABLE `users` ADD COLUMN `phone` VARCHAR(60) NULL AFTER `username`",
    );

    await queryInterface.sequelize.query(
      "ALTER TABLE `users` ADD UNIQUE INDEX `users_username_unique` (`username`)",
    );

    await queryInterface.sequelize.query(
      "ALTER TABLE `users` ADD UNIQUE INDEX `users_phone_unique` (`phone`)",
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query("ALTER TABLE `users` DROP INDEX `users_username_unique`").catch(() => {});
    await queryInterface.sequelize.query("ALTER TABLE `users` DROP INDEX `users_phone_unique`").catch(() => {});
    await queryInterface.sequelize.query("ALTER TABLE `users` DROP COLUMN `phone`").catch(() => {});
    await queryInterface.sequelize.query("ALTER TABLE `users` DROP COLUMN `username`").catch(() => {});
    await queryInterface.sequelize.query("ALTER TABLE `users` MODIFY `email` VARCHAR(191) NOT NULL").catch(() => {});
  },
};
