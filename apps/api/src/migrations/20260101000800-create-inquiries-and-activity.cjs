'use strict';

/**
 * Leads and the audit trail.
 *
 * contact_inquiries stores public form submissions. The submitter's IP is kept
 * only as a salted hash: enough to spot a spam campaign, not enough to identify
 * an individual.
 *
 * activity_logs has no `deleted_at` — the audit trail is append-only, and rows
 * are aged out by the retention job rather than deleted by hand.
 */

const { addConstraint, addIndex, columns, createJoinTable, createTable, dropTableIfExists } = require('../migration-helpers/index.cjs');


module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt, DECIMAL } = columns(Sequelize);

    await createTable(queryInterface, 
      'contact_inquiries',
      {
        id: PK,
        name: { type: Sequelize.STRING(160), allowNull: false },
        email: { type: Sequelize.STRING(191), allowNull: false },
        phone: { type: Sequelize.STRING(60), allowNull: true },
        company: { type: Sequelize.STRING(191), allowNull: true },
        subject: { type: Sequelize.STRING(191), allowNull: true },
        serviceId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        message: { type: Sequelize.TEXT, allowNull: false },
        status: {
          type: Sequelize.ENUM('new', 'contacted', 'qualified', 'converted', 'closed'),
          allowNull: false,
          defaultValue: 'new',
        },
        isRead: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        isArchived: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        assignedToId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        notes: { type: Sequelize.TEXT, allowNull: true },
        ipHash: { type: Sequelize.STRING(64), allowNull: true },
        // Heuristic score set at intake; high-scoring rows are filtered out of
        // the default admin view.
        spamScore: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        utmSource: { type: Sequelize.STRING(191), allowNull: true },
        utmMedium: { type: Sequelize.STRING(191), allowNull: true },
        utmCampaign: { type: Sequelize.STRING(191), allowNull: true },
        referrer: { type: Sequelize.STRING(500), allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    // Matches the admin inbox's default query exactly.
    await addIndex(queryInterface, 'contact_inquiries', ['isArchived', 'status', 'isRead', 'createdAt'], {
      name: 'contact_inquiries_inbox_idx',
    });
    await addIndex(queryInterface, 'contact_inquiries', ['email'], { name: 'contact_inquiries_email_idx' });
    await addIndex(queryInterface, 'contact_inquiries', ['spamScore'], { name: 'contact_inquiries_spam_idx' });
    await addConstraint(queryInterface, 'contact_inquiries', {
      fields: ['serviceId'],
      type: 'foreign key',
      name: 'contact_inquiries_service_fk',
      references: { table: 'services', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'contact_inquiries', {
      fields: ['assignedToId'],
      type: 'foreign key',
      name: 'contact_inquiries_assignee_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 
      'activity_logs',
      {
        id: PK,
        // userId is nullable: a failed login from an unknown email has no user.
        userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        userEmail: { type: Sequelize.STRING(191), allowNull: true },
        action: { type: Sequelize.STRING(60), allowNull: false },
        entity: { type: Sequelize.STRING(60), allowNull: false },
        entityId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        // Redacted JSON diff of the changed fields. Never holds secrets.
        metadata: { type: Sequelize.JSON, allowNull: true },
        ip: { type: Sequelize.STRING(191), allowNull: true },
        userAgent: { type: Sequelize.STRING(255), allowNull: true },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    // Supports "show me everything that happened to this record".
    await addIndex(queryInterface, 'activity_logs', ['entity', 'entityId'], { name: 'activity_logs_entity_idx' });
    await addIndex(queryInterface, 'activity_logs', ['userId'], { name: 'activity_logs_user_idx' });
    await addIndex(queryInterface, 'activity_logs', ['action'], { name: 'activity_logs_action_idx' });
    await addIndex(queryInterface, 'activity_logs', ['createdAt'], { name: 'activity_logs_created_idx' });
    await addConstraint(queryInterface, 'activity_logs', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'activity_logs_user_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'activity_logs');
    await dropTableIfExists(queryInterface, 'contact_inquiries');
  },
};