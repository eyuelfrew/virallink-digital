'use strict';

/**
 * Company profile, branding assets and public social links.
 *
 * `companies` is a singleton table: the site has one company, so the profile is
 * a single row rather than a collection. `media` is created here too because
 * companies.logo_media_id and companies.favicon_media_id point at it.
 */

const { addConstraint, addIndex, columns, createJoinTable, createTable, dropTableIfExists } = require('../migration-helpers/index.cjs');


module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt, DECIMAL } = columns(Sequelize);

    await createTable(queryInterface, 
      'media',
      {
        id: PK,
        // Storage key such as 2026/01/aBc123.webp. The public URL is derived
        // from this, so moving the storage driver never rewrites rows.
        key: { type: Sequelize.STRING(255), allowNull: false, unique: true },
        url: { type: Sequelize.STRING(500), allowNull: false },
        kind: {
          type: Sequelize.ENUM('image', 'video', 'document', 'svg'),
          allowNull: false,
          defaultValue: 'image',
        },
        mimeType: { type: Sequelize.STRING(120), allowNull: false },
        // Stored so the layout can reserve space before load, which is what
        // keeps cumulative layout shift near zero.
        width: { type: Sequelize.INTEGER, allowNull: true },
        height: { type: Sequelize.INTEGER, allowNull: true },
        sizeBytes: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        altText: { type: Sequelize.STRING(300), allowNull: true },
        title: { type: Sequelize.STRING(300), allowNull: true },
        caption: { type: Sequelize.STRING(500), allowNull: true },
        // Inline 20px preview generated at upload time for blur-up placeholders.
        blurDataUrl: { type: Sequelize.TEXT, allowNull: true },
        uploadedById: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        folder: { type: Sequelize.STRING(120), allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'media', ['kind'], { name: 'media_kind_idx' });
    await addIndex(queryInterface, 'media', ['folder'], { name: 'media_folder_idx' });
    await addConstraint(queryInterface, 'media', {
      fields: ['uploadedById'],
      type: 'foreign key',
      name: 'media_uploader_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 
      'companies',
      {
        id: PK,
        name: { type: Sequelize.STRING(191), allowNull: false },
        legalName: { type: Sequelize.STRING(191), allowNull: true },
        shortDescription: { type: Sequelize.STRING(500), allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        mission: { type: Sequelize.TEXT, allowNull: true },
        vision: { type: Sequelize.TEXT, allowNull: true },
        values: { type: Sequelize.TEXT, allowNull: true },
        foundedDate: { type: Sequelize.DATEONLY, allowNull: true },
        // Business registration details support LocalBusiness/Organization schema.
        registrationNumber: { type: Sequelize.STRING(120), allowNull: true },
        taxIdentifier: { type: Sequelize.STRING(120), allowNull: true },
        addressLine1: { type: Sequelize.STRING(191), allowNull: true },
        addressLine2: { type: Sequelize.STRING(191), allowNull: true },
        city: { type: Sequelize.STRING(120), allowNull: true },
        region: { type: Sequelize.STRING(120), allowNull: true },
        country: { type: Sequelize.STRING(120), allowNull: true },
        postalCode: { type: Sequelize.STRING(32), allowNull: true },
        latitude: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
        longitude: { type: Sequelize.DECIMAL(10, 7), allowNull: true },
        phone: { type: Sequelize.STRING(60), allowNull: true },
        secondaryPhone: { type: Sequelize.STRING(191), allowNull: true },
        email: { type: Sequelize.STRING(191), allowNull: true },
        website: { type: Sequelize.STRING(255), allowNull: true },
        logoMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        faviconMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        openingHours: { type: Sequelize.STRING(500), allowNull: true },
        metaTitle: { type: Sequelize.STRING(191), allowNull: true },
        metaDescription: { type: Sequelize.STRING(400), allowNull: true },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'companies', ['name'], { name: 'companies_name_idx' });
    await addConstraint(queryInterface, 'companies', {
      fields: ['logoMediaId'],
      type: 'foreign key',
      name: 'companies_logo_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'companies', {
      fields: ['faviconMediaId'],
      type: 'foreign key',
      name: 'companies_favicon_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 
      'social_links',
      {
        id: PK,
        companyId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        platform: { type: Sequelize.STRING(60), allowNull: false },
        label: { type: Sequelize.STRING(191), allowNull: true },
        url: { type: Sequelize.STRING(255), allowNull: false },
        displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'social_links', ['companyId', 'displayOrder'], { name: 'social_links_company_idx' });
    await addConstraint(queryInterface, 'social_links', {
      fields: ['companyId'],
      type: 'foreign key',
      name: 'social_links_company_fk',
      references: { table: 'companies', field: 'id' },
      onDelete: 'CASCADE',
    });

    await createTable(queryInterface, 
      'company_stats',
      {
        id: PK,
        companyId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        label: { type: Sequelize.STRING(120), allowNull: false },
        value: { type: Sequelize.STRING(60), allowNull: false },
        description: { type: Sequelize.STRING(300), allowNull: true },
        icon: { type: Sequelize.STRING(191), allowNull: true },
        displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // Nothing appears on the homepage until an admin publishes it. This is
        // what prevents invented statistics from ever reaching the page.
        isPublished: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'company_stats', ['companyId', 'isPublished', 'displayOrder'], {
      name: 'company_stats_publish_idx',
    });
    await addConstraint(queryInterface, 'company_stats', {
      fields: ['companyId'],
      type: 'foreign key',
      name: 'company_stats_company_fk',
      references: { table: 'companies', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'company_stats');
    await dropTableIfExists(queryInterface, 'social_links');
    await dropTableIfExists(queryInterface, 'companies');
    await dropTableIfExists(queryInterface, 'media');
  },
};