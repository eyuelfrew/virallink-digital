'use strict';

/**
 * Client reporting: deliverables and monthly performance.
 *
 * content_deliverables records what was produced for a client. content_metrics
 * records how one deliverable performed in one month on one platform.
 *
 * The split matters: a client asks "how many videos did you make me this month"
 * (deliverables) separately from "how many views did they get" (metrics), and
 * conflating them produces a number that is wrong for one question or the other.
 *
 * Two decisions worth stating:
 *
 *  - `month` is CHAR(7) 'YYYY-MM', zero padded. Grouping on a string sorts
 *    chronologically and cannot be shifted across a month boundary by a
 *    timezone, which a DATE column can.
 *
 *  - The (deliverable, month, platform) unique index is what makes metric entry
 *    safe. Without it two members of staff saving the same figure at the same
 *    moment would create two rows and the report would double-count. Enforcing it
 *    in the database rather than only in the service closes the race.
 */

const {
  addConstraint,
  addIndex,
  columns,
  createTable,
  dropTableIfExists,
} = require('../migration-helpers/index.cjs');

const DELIVERABLE_TYPE = ['video', 'image', 'design', 'copy', 'web', 'social', 'other'];
const METRIC_PLATFORM = ['youtube', 'tiktok', 'facebook', 'instagram', 'linkedin', 'x', 'website', 'other'];
const METRIC_SOURCE = ['manual', 'api'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt } = columns(Sequelize);

    await createTable(queryInterface, 'content_deliverables', {
      id: PK,
      clientId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      title: { type: Sequelize.STRING(191), allowNull: false },
      type: { type: Sequelize.ENUM(...DELIVERABLE_TYPE), allowNull: false, defaultValue: 'video' },
      platform: { type: Sequelize.ENUM(...METRIC_PLATFORM), allowNull: false, defaultValue: 'other' },
      url: { type: Sequelize.STRING(500), allowNull: true, defaultValue: null },
      publishedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      // Set only when the file is actually hosted by us.
      mediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      notes: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      createdAt,
      updatedAt,
      deletedAt,
    });

    // The report's core query is "everything for one client in one month".
    await addIndex(queryInterface, 'content_deliverables', ['clientId', 'publishedAt'], {
      name: 'deliverables_client_published',
    });
    await addIndex(queryInterface, 'content_deliverables', ['clientId', 'type'], {
      name: 'deliverables_client_type',
    });

    // Restrict rather than cascade on delete: a client with deliverables should
    // not be deletable by accident from the clients table, which is the safer
    // failure. The API removes deliverables explicitly when a client is deleted.
    await addConstraint(queryInterface, 'content_deliverables', {
      fields: ['clientId'],
      type: 'foreign key',
      name: 'deliverables_client_fk',
      references: { table: 'clients', field: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    });

    await createTable(queryInterface, 'content_metrics', {
      id: PK,
      deliverableId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      month: { type: Sequelize.STRING(7), allowNull: false },
      platform: { type: Sequelize.ENUM(...METRIC_PLATFORM), allowNull: false, defaultValue: 'other' },
      // Nullable on purpose: NULL means "not measured", 0 means "measured, none".
      views: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
      likes: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
      comments: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
      shares: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },
      watchHours: { type: Sequelize.DECIMAL(12, 2), allowNull: true, defaultValue: null },
      source: { type: Sequelize.ENUM(...METRIC_SOURCE), allowNull: false, defaultValue: 'manual' },
      createdAt,
      updatedAt,
      deletedAt,
    });

    // One figure per deliverable per month per platform. This is the guarantee
    // that manual entry cannot silently double-count.
    await addIndex(queryInterface, 'content_metrics', ['deliverableId', 'month', 'platform'], {
      name: 'metrics_deliverable_month_platform',
      unique: true,
    });

    // Month-range scans for the trend chart.
    await addIndex(queryInterface, 'content_metrics', ['month'], { name: 'metrics_month' });

    // Metrics have no meaning without their deliverable, and an orphaned row
    // would never be read again — so cascade here rather than restrict.
    await addConstraint(queryInterface, 'content_metrics', {
      fields: ['deliverableId'],
      type: 'foreign key',
      name: 'metrics_deliverable_fk',
      references: { table: 'content_deliverables', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    // Deliverables first: the FK from metrics points at it.
    await dropTableIfExists(queryInterface, 'content_metrics');
    await dropTableIfExists(queryInterface, 'content_deliverables');
  },
};