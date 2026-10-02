'use strict';

/**
 * Services, portfolio projects, the technology tags used by case studies, and
 * job openings for the careers page.
 */

const { addConstraint, addIndex, columns, createJoinTable, createTable, dropTableIfExists } = require('../migration-helpers/index.cjs');


module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt, DECIMAL } = columns(Sequelize);

    await createTable(queryInterface, 
      'services',
      {
        id: PK,
        title: { type: Sequelize.STRING(191), allowNull: false },
        // SEO-friendly URL segment, unique across the table.
        slug: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        summary: { type: Sequelize.STRING(500), allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        // Lucide icon name only. Arbitrary markup is never stored or rendered.
        icon: { type: Sequelize.STRING(191), allowNull: true },
        imageMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        // Lets a specific offering sit under a broader service category.
        parentId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        isPublished: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        metaTitle: { type: Sequelize.STRING(191), allowNull: true },
        metaDescription: { type: Sequelize.STRING(400), allowNull: true },
        // JSON array of {question, answer}, rendered as FAQPage schema.
        faq: { type: Sequelize.JSON, allowNull: true, defaultValue: [] },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'services', ['isPublished', 'displayOrder'], { name: 'services_publish_idx' });
    await addConstraint(queryInterface, 'services', {
      fields: ['imageMediaId'],
      type: 'foreign key',
      name: 'services_image_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'services', {
      fields: ['parentId'],
      type: 'foreign key',
      name: 'services_parent_fk',
      references: { table: 'services', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 
      'projects',
      {
        id: PK,
        title: { type: Sequelize.STRING(191), allowNull: false },
        slug: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        clientId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        serviceId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        summary: { type: Sequelize.STRING(500), allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: true },
        challenge: { type: Sequelize.TEXT, allowNull: true },
        solution: { type: Sequelize.TEXT, allowNull: true },
        results: { type: Sequelize.TEXT, allowNull: true },
        technologies: { type: Sequelize.JSON, allowNull: true, defaultValue: [] },
        projectUrl: { type: Sequelize.STRING(255), allowNull: true },
        coverMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        status: {
          type: Sequelize.ENUM('planning', 'in_progress', 'review', 'on_hold', 'completed', 'cancelled'),
          allowNull: false,
          defaultValue: 'in_progress',
        },
        isFeatured: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        isPublished: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        publishedAt: { type: Sequelize.DATE, allowNull: true },
        startedAt: { type: Sequelize.DATEONLY, allowNull: true },
        completedAt: { type: Sequelize.DATEONLY, allowNull: true },
        // Drives the "upcoming deadlines" tile on the dashboard.
        deadlineAt: { type: Sequelize.DATEONLY, allowNull: true },
        displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        metaTitle: { type: Sequelize.STRING(191), allowNull: true },
        metaDescription: { type: Sequelize.STRING(400), allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'projects', ['isPublished', 'isFeatured'], { name: 'projects_featured_idx' });
    await addIndex(queryInterface, 'projects', ['clientId'], { name: 'projects_client_idx' });
    await addIndex(queryInterface, 'projects', ['serviceId'], { name: 'projects_service_idx' });
    await addIndex(queryInterface, 'projects', ['status'], { name: 'projects_status_idx' });
    await addIndex(queryInterface, 'projects', ['isPublished', 'publishedAt'], { name: 'projects_published_idx' });
    await addConstraint(queryInterface, 'projects', {
      fields: ['clientId'],
      type: 'foreign key',
      name: 'projects_client_fk',
      references: { table: 'clients', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'projects', {
      fields: ['serviceId'],
      type: 'foreign key',
      name: 'projects_service_fk',
      references: { table: 'services', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'projects', {
      fields: ['coverMediaId'],
      type: 'foreign key',
      name: 'projects_cover_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 
      'project_images',
      {
        id: PK,
        projectId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        mediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        caption: { type: Sequelize.STRING(300), allowNull: true },
        displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'project_images', ['projectId', 'displayOrder'], { name: 'project_images_idx' });
    await addConstraint(queryInterface, 'project_images', {
      fields: ['projectId'],
      type: 'foreign key',
      name: 'project_images_project_fk',
      references: { table: 'projects', field: 'id' },
      onDelete: 'CASCADE',
    });
    await addConstraint(queryInterface, 'project_images', {
      fields: ['mediaId'],
      type: 'foreign key',
      name: 'project_images_media_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'CASCADE',
    });

    await createTable(queryInterface, 
      'technologies',
      {
        id: PK,
        name: { type: Sequelize.STRING(80), allowNull: false, unique: true },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    await createJoinTable(queryInterface, Sequelize, 'project_technologies', {
      left: 'projectId',
      right: 'technologyId',
      leftTable: 'projects',
      rightTable: 'technologies',
    });

    await createTable(queryInterface, 
      'jobs',
      {
        id: PK,
        title: { type: Sequelize.STRING(191), allowNull: false },
        slug: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        departmentId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        employmentType: { type: Sequelize.STRING(191), allowNull: true },
        location: { type: Sequelize.STRING(191), allowNull: true },
        isRemote: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        summary: { type: Sequelize.STRING(500), allowNull: true },
        description: { type: Sequelize.TEXT, allowNull: false },
        requirements: { type: Sequelize.TEXT, allowNull: true },
        applyEmail: { type: Sequelize.STRING(191), allowNull: true },
        applyUrl: { type: Sequelize.STRING(255), allowNull: true },
        isPublished: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        closesAt: { type: Sequelize.DATEONLY, allowNull: true },
        displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'jobs', ['isPublished', 'displayOrder'], { name: 'jobs_publish_idx' });
    await addConstraint(queryInterface, 'jobs', {
      fields: ['departmentId'],
      type: 'foreign key',
      name: 'jobs_department_fk',
      references: { table: 'departments', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'jobs');
    await dropTableIfExists(queryInterface, 'project_technologies');
    await dropTableIfExists(queryInterface, 'technologies');
    await dropTableIfExists(queryInterface, 'project_images');
    await dropTableIfExists(queryInterface, 'projects');
    await dropTableIfExists(queryInterface, 'services');
  },
};