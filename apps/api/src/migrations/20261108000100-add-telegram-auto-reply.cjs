'use strict';

const {
  addConstraint,
  addIndex,
  columns,
  createTable,
  dropTableIfExists,
} = require('../migration-helpers/index.cjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt } = columns(Sequelize);

    await createTable(queryInterface, 'telegram_auto_reply_accounts', {
      id: PK,
      ownerUserId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      name: { type: Sequelize.STRING(120), allowNull: false },
      provider: {
        type: Sequelize.ENUM('env', 'custom'),
        allowNull: false,
        defaultValue: 'custom',
      },
      telegramBotId: { type: Sequelize.BIGINT, allowNull: true, defaultValue: null },
      botUsername: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      botToken: { type: Sequelize.TEXT, allowNull: true },
      webhookSecret: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      isCompany: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      webhookStatus: {
        type: Sequelize.ENUM('pending', 'active', 'error'),
        allowNull: false,
        defaultValue: 'pending',
      },
      lastError: { type: Sequelize.STRING(500), allowNull: true, defaultValue: null },
      lastSyncedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'telegram_auto_reply_accounts', ['ownerUserId'], {
      name: 'telegram_auto_reply_accounts_owner_idx',
    });
    await addIndex(queryInterface, 'telegram_auto_reply_accounts', ['provider'], {
      name: 'telegram_auto_reply_accounts_provider_idx',
    });
    await addIndex(queryInterface, 'telegram_auto_reply_accounts', ['telegramBotId'], {
      unique: true,
      name: 'telegram_auto_reply_accounts_bot_id_unique',
    });
    await addIndex(queryInterface, 'telegram_auto_reply_accounts', ['isCompany'], {
      name: 'telegram_auto_reply_accounts_company_idx',
    });
    await addConstraint(queryInterface, 'telegram_auto_reply_accounts', {
      fields: ['ownerUserId'],
      type: 'foreign key',
      name: 'telegram_auto_reply_accounts_owner_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });

    await createTable(queryInterface, 'telegram_auto_reply_settings', {
      id: PK,
      accountId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      isEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      welcomeMessage: { type: Sequelize.TEXT, allowNull: true },
      awayMessage: { type: Sequelize.TEXT, allowNull: true },
      awayMode: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      awayCooldownMinutes: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 360 },
      catalogEnabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      catalogIntro: { type: Sequelize.TEXT, allowNull: true },
      replyToNewChats: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      replyToReturningChats: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'telegram_auto_reply_settings', ['accountId'], {
      unique: true,
      name: 'telegram_auto_reply_settings_account_unique',
    });
    await addConstraint(queryInterface, 'telegram_auto_reply_settings', {
      fields: ['accountId'],
      type: 'foreign key',
      name: 'telegram_auto_reply_settings_account_fk',
      references: { table: 'telegram_auto_reply_accounts', field: 'id' },
      onDelete: 'CASCADE',
    });

    await createTable(queryInterface, 'telegram_catalog_items', {
      id: PK,
      name: { type: Sequelize.STRING(191), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      price: { type: Sequelize.DECIMAL(14, 2), allowNull: true, defaultValue: null },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'ETB' },
      imageMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'telegram_catalog_items', ['isActive', 'displayOrder'], {
      name: 'telegram_catalog_items_active_order_idx',
    });
    await addIndex(queryInterface, 'telegram_catalog_items', ['imageMediaId'], {
      name: 'telegram_catalog_items_image_idx',
    });
    await addConstraint(queryInterface, 'telegram_catalog_items', {
      fields: ['imageMediaId'],
      type: 'foreign key',
      name: 'telegram_catalog_items_image_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 'telegram_auto_reply_conversations', {
      id: PK,
      accountId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      chatId: { type: Sequelize.BIGINT, allowNull: false },
      chatType: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'private' },
      title: { type: Sequelize.STRING(191), allowNull: true, defaultValue: null },
      username: { type: Sequelize.STRING(64), allowNull: true, defaultValue: null },
      firstName: { type: Sequelize.STRING(120), allowNull: true, defaultValue: null },
      lastName: { type: Sequelize.STRING(120), allowNull: true, defaultValue: null },
      lastMessageText: { type: Sequelize.TEXT, allowNull: true },
      lastTelegramMessageId: { type: Sequelize.BIGINT, allowNull: true, defaultValue: null },
      messageCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      replyCount: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      firstMessageAt: { type: Sequelize.DATE, allowNull: false },
      lastMessageAt: { type: Sequelize.DATE, allowNull: false },
      lastReplyAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      lastAwayReplyAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      isBlocked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      createdAt,
      updatedAt,
    });

    await addIndex(queryInterface, 'telegram_auto_reply_conversations', ['accountId', 'chatId'], {
      unique: true,
      name: 'telegram_conversations_account_chat_unique',
    });
    await addIndex(queryInterface, 'telegram_auto_reply_conversations', ['accountId', 'lastMessageAt'], {
      name: 'telegram_conversations_account_last_message_idx',
    });
    await addIndex(queryInterface, 'telegram_auto_reply_conversations', ['chatId'], {
      name: 'telegram_conversations_chat_idx',
    });
    await addConstraint(queryInterface, 'telegram_auto_reply_conversations', {
      fields: ['accountId'],
      type: 'foreign key',
      name: 'telegram_auto_reply_conversations_account_fk',
      references: { table: 'telegram_auto_reply_accounts', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'telegram_auto_reply_conversations');
    await dropTableIfExists(queryInterface, 'telegram_catalog_items');
    await dropTableIfExists(queryInterface, 'telegram_auto_reply_settings');
    await dropTableIfExists(queryInterface, 'telegram_auto_reply_accounts');
  },
};
