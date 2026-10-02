'use strict';

/**
 * Blog: posts, categories and tags.
 */

const { addConstraint, addIndex, columns, createJoinTable, createTable, dropTableIfExists } = require('../migration-helpers/index.cjs');


module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt, DECIMAL } = columns(Sequelize);

    await createTable(queryInterface, 
      'blog_categories',
      {
        id: PK,
        name: { type: Sequelize.STRING(120), allowNull: false },
        slug: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        description: { type: Sequelize.STRING(500), allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    await createTable(queryInterface, 
      'blog_tags',
      {
        id: PK,
        name: { type: Sequelize.STRING(120), allowNull: false },
        slug: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    await createTable(queryInterface, 
      'blog_posts',
      {
        id: PK,
        title: { type: Sequelize.STRING(191), allowNull: false },
        slug: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        excerpt: { type: Sequelize.STRING(500), allowNull: true },
        content: { type: Sequelize.TEXT, allowNull: false },
        featuredMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        authorId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        // 'draft' posts are invisible to the public API and never in the sitemap.
        status: { type: Sequelize.ENUM('draft', 'published'), allowNull: false, defaultValue: 'draft' },
        publishedAt: { type: Sequelize.DATE, allowNull: true },
        metaTitle: { type: Sequelize.STRING(191), allowNull: true },
        metaDescription: { type: Sequelize.STRING(400), allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'blog_posts', ['status', 'publishedAt'], { name: 'blog_posts_publish_idx' });
    await addConstraint(queryInterface, 'blog_posts', {
      fields: ['featuredMediaId'],
      type: 'foreign key',
      name: 'blog_posts_featured_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'blog_posts', {
      fields: ['authorId'],
      type: 'foreign key',
      name: 'blog_posts_author_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createJoinTable(queryInterface, Sequelize, 'blog_post_categories', {
      left: 'postId',
      right: 'categoryId',
      leftTable: 'blog_posts',
      rightTable: 'blog_categories',
    });

    await createJoinTable(queryInterface, Sequelize, 'blog_post_tags', {
      left: 'postId',
      right: 'tagId',
      leftTable: 'blog_posts',
      rightTable: 'blog_tags',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'blog_post_tags');
    await dropTableIfExists(queryInterface, 'blog_post_categories');
    await dropTableIfExists(queryInterface, 'blog_posts');
    await dropTableIfExists(queryInterface, 'blog_tags');
    await dropTableIfExists(queryInterface, 'blog_categories');
  },
};