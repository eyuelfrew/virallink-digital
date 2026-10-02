'use strict';

/**
 * Clients, their internal notes, communication log and testimonials.
 */

const { addConstraint, addIndex, columns, createJoinTable, createTable, dropTableIfExists } = require('../migration-helpers/index.cjs');


module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt, DECIMAL } = columns(Sequelize);

    await createTable(queryInterface, 
      'clients',
      {
        id: PK,
        name: { type: Sequelize.STRING(191), allowNull: false },
        contactPerson: { type: Sequelize.STRING(191), allowNull: true },
        email: { type: Sequelize.STRING(191), allowNull: true },
        phone: { type: Sequelize.STRING(60), allowNull: true },
        website: { type: Sequelize.STRING(255), allowNull: true },
        industry: { type: Sequelize.STRING(191), allowNull: true },
        addressLine1: { type: Sequelize.STRING(191), allowNull: true },
        city: { type: Sequelize.STRING(120), allowNull: true },
        country: { type: Sequelize.STRING(120), allowNull: true },
        status: {
          type: Sequelize.ENUM('prospect', 'active', 'inactive', 'churned'),
          allowNull: false,
          defaultValue: 'prospect',
        },
        source: {
          type: Sequelize.ENUM('website', 'referral', 'phone', 'social', 'walk_in', 'other'),
          allowNull: true,
        },
        notes: { type: Sequelize.TEXT, allowNull: true },
        logoMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        // Only opted-in clients appear on the public /clients page.
        isPublic: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        // DECIMAL, never a float: contract value is money.
        contractValue: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'clients', ['status'], { name: 'clients_status_idx' });
    await addIndex(queryInterface, 'clients', ['name'], { name: 'clients_name_idx' });
    await addIndex(queryInterface, 'clients', ['isPublic'], { name: 'clients_public_idx' });
    await addConstraint(queryInterface, 'clients', {
      fields: ['logoMediaId'],
      type: 'foreign key',
      name: 'clients_logo_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });

    // Internal notes are separate from the client's own notes field so the CRM
    // can log a dated history without overwriting the summary.
    await createTable(queryInterface, 
      'client_notes',
      {
        id: PK,
        clientId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        body: { type: Sequelize.TEXT, allowNull: false },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'client_notes', ['clientId', 'createdAt'], { name: 'client_notes_client_idx' });
    await addConstraint(queryInterface, 'client_notes', {
      fields: ['clientId'],
      type: 'foreign key',
      name: 'client_notes_client_fk',
      references: { table: 'clients', field: 'id' },
      onDelete: 'CASCADE',
    });
    await addConstraint(queryInterface, 'client_notes', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'client_notes_user_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 
      'client_communications',
      {
        id: PK,
        clientId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        type: {
          type: Sequelize.ENUM('call', 'email', 'meeting', 'other'),
          allowNull: false,
          defaultValue: 'call',
        },
        subject: { type: Sequelize.STRING(191), allowNull: true },
        body: { type: Sequelize.TEXT, allowNull: true },
        occurredAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('CURRENT_TIMESTAMP') },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'client_communications', ['clientId', 'occurredAt'], {
      name: 'client_comms_client_idx',
    });
    await addConstraint(queryInterface, 'client_communications', {
      fields: ['clientId'],
      type: 'foreign key',
      name: 'client_comms_client_fk',
      references: { table: 'clients', field: 'id' },
      onDelete: 'CASCADE',
    });

    await createTable(queryInterface, 
      'testimonials',
      {
        id: PK,
        authorName: { type: Sequelize.STRING(160), allowNull: false },
        authorPosition: { type: Sequelize.STRING(191), allowNull: true },
        authorCompany: { type: Sequelize.STRING(191), allowNull: true },
        authorPhotoMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        clientId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        body: { type: Sequelize.TEXT, allowNull: false },
        rating: { type: Sequelize.TINYINT.UNSIGNED, allowNull: true },
        isPublished: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'testimonials', ['isPublished', 'displayOrder'], { name: 'testimonials_publish_idx' });
    await addConstraint(queryInterface, 'testimonials', {
      fields: ['authorPhotoMediaId'],
      type: 'foreign key',
      name: 'testimonials_photo_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'testimonials', {
      fields: ['clientId'],
      type: 'foreign key',
      name: 'testimonials_client_fk',
      references: { table: 'clients', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'testimonials');
    await dropTableIfExists(queryInterface, 'client_communications');
    await dropTableIfExists(queryInterface, 'client_notes');
    await dropTableIfExists(queryInterface, 'clients');
  },
};