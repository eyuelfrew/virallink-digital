'use strict';

/**
 * Interactive menus and multi-image albums for Telegram auto-reply.
 *
 * Menu buttons are per-account: each button carries a label and an action
 * (send the catalog, send a text reply, send a photo album, open a URL, open a
 * submenu, or return to the main menu). A null parent id is a top-level button;
 * a set parent id places the button inside a submenu.
 *
 * Albums are ordered lists of media ids stored as JSON on catalog items and
 * reply rules. The original single imageMediaId column is kept untouched so
 * existing items and uploads keep working.
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

const MENU_ACTION = ['catalog', 'text', 'album', 'url', 'submenu', 'menu'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt } = columns(Sequelize);

    await createTable(queryInterface, 'telegram_menu_buttons', {
      id: PK,
      accountId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      parentId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      label: { type: Sequelize.STRING(64), allowNull: false },
      action: {
        type: Sequelize.ENUM(...MENU_ACTION),
        allowNull: false,
        defaultValue: 'text',
      },
      replyText: { type: Sequelize.TEXT, allowNull: true },
      url: { type: Sequelize.STRING(2048), allowNull: true, defaultValue: null },
      imageMediaIds: { type: Sequelize.JSON, allowNull: true, defaultValue: null },
      displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'telegram_menu_buttons', ['accountId', 'isActive', 'displayOrder'], {
      name: 'telegram_menu_buttons_account_order_idx',
    });
    await addIndex(queryInterface, 'telegram_menu_buttons', ['parentId'], {
      name: 'telegram_menu_buttons_parent_idx',
    });
    await addConstraint(queryInterface, 'telegram_menu_buttons', {
      fields: ['accountId'],
      type: 'foreign key',
      name: 'telegram_menu_buttons_account_fk',
      references: { table: 'telegram_auto_reply_accounts', field: 'id' },
      onDelete: 'CASCADE',
    });
    await addConstraint(queryInterface, 'telegram_menu_buttons', {
      fields: ['parentId'],
      type: 'foreign key',
      name: 'telegram_menu_buttons_parent_fk',
      references: { table: 'telegram_menu_buttons', field: 'id' },
      onDelete: 'CASCADE',
    });

    await addColumns(queryInterface, 'telegram_auto_reply_rules', {
      imageMediaIds: { type: Sequelize.JSON, allowNull: true, defaultValue: null },
      showMenu: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    });

    await addColumns(queryInterface, 'telegram_auto_reply_settings', {
      menuEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      menuTitle: { type: Sequelize.STRING(300), allowNull: true, defaultValue: null },
    });

    await addColumns(queryInterface, 'telegram_catalog_items', {
      imageMediaIds: { type: Sequelize.JSON, allowNull: true, defaultValue: null },
    });
  },

  async down(queryInterface) {
    await removeColumn(queryInterface, 'telegram_catalog_items', 'imageMediaIds');
    await removeColumn(queryInterface, 'telegram_auto_reply_settings', 'menuTitle');
    await removeColumn(queryInterface, 'telegram_auto_reply_settings', 'menuEnabled');
    await removeColumn(queryInterface, 'telegram_auto_reply_rules', 'showMenu');
    await removeColumn(queryInterface, 'telegram_auto_reply_rules', 'imageMediaIds');
    await dropTableIfExists(queryInterface, 'telegram_menu_buttons');
  },
};