'use strict';

/**
 * Content production pipeline.
 *
 * Turns content_deliverables from a flat log of finished work into something
 * still in flight. Three additions:
 *
 *  - Columns on content_deliverables: the stage, the two dates that actually
 *    drive a shoot schedule, an assignee, and the working material (idea,
 *    brainstorm notes, script, approval feedback).
 *
 *  - content_stage_events: an append-only history of every stage change. This is
 *    what makes cycle time possible — the average number of days a piece spends
 *    waiting for client approval is the kind of number that changes how a team
 *    works, and it cannot be derived from current state alone. Once a card has
 *    moved on, the old timestamps are gone.
 *
 *  - client_proposals: the idea pack put to a client, which is upstream of the
 *    pipeline rather than part of it. An accepted proposal becomes content; a
 *    draft one is just a document.
 *
 * Two scheduling dates, deliberately distinct:
 *
 *    shootDate  — the day the crew is booked. Fixed in advance; it is a cost.
 *    scheduledFor — when it is planned to go live.
 *    publishedAt — when it actually did.
 *
 * Keeping them apart is what lets you answer "is anything shooting this week"
 * without conflating it with "is anything going out this week", which are
 * different questions with different people waiting on the answer.
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

const CONTENT_STAGE = [
  'idea', 'brainstorming', 'writing', 'approval', 'revision',
  'shooting', 'editing', 'scheduled', 'posted',
];
const PROPOSAL_STATUS = ['draft', 'sent', 'accepted', 'declined'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt } = columns(Sequelize);

    /* ------------------------------------------------------------------ */
    /* Pipeline columns on the existing table                              */
    /* ------------------------------------------------------------------ */

    // One call, so the snake_case conversion is applied uniformly. Doing these
    // individually with queryInterface.addColumn is what put camelCase columns on
    // the table the first time this migration ran.
    await addColumns(queryInterface, 'content_deliverables', {
      stage: {
        type: Sequelize.ENUM(...CONTENT_STAGE),
        allowNull: false,
        // Existing rows are finished work: they were logged after the fact, not
        // tracked through a board. Defaulting them to 'posted' keeps the board
        // correct without forcing every historical row to be migrated by hand.
        defaultValue: 'posted',
      },

      // The day the crew is booked. Fixed in advance, and it is a cost.
      shootDate: { type: Sequelize.DATEONLY, allowNull: true, defaultValue: null },

      // When it is planned to go live, as distinct from when it did.
      scheduledFor: { type: Sequelize.DATEONLY, allowNull: true, defaultValue: null },

      assigneeId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },

      // How many times this came back from the client. Null means 'never sent for
      // approval', which is not the same as 'sent once and accepted first time'.
      revisionCount: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true, defaultValue: null },

      // Working material, one field per step so nothing gets overwritten.
      idea: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      brainstormNotes: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      scriptBody: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      approvalNotes: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
    });

    // The board's primary query: open work, by stage, soonest shoot first.
    await addIndex(queryInterface, 'content_deliverables', ['stage', 'shootDate'], {
      name: 'deliverables_stage_shoot',
    });
    await addIndex(queryInterface, 'content_deliverables', ['scheduledFor'], {
      name: 'deliverables_scheduled_for',
    });

    /* ------------------------------------------------------------------ */
    /* Stage history                                                      */
    /* ------------------------------------------------------------------ */

    await createTable(queryInterface, 'content_stage_events', {
      id: PK,
      deliverableId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      fromStage: { type: Sequelize.ENUM(...CONTENT_STAGE), allowNull: true, defaultValue: null },
      toStage: { type: Sequelize.ENUM(...CONTENT_STAGE), allowNull: false },
      userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, defaultValue: null },
      note: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      createdAt,
      updatedAt,
    });

    // Cycle time is computed as "time spent in toStage", so this index is the
    // whole query for every stage-duration figure the weekly report shows.
    await addIndex(queryInterface, 'content_stage_events', ['toStage', 'createdAt'], {
      name: 'stage_events_stage_created',
    });
    await addIndex(queryInterface, 'content_stage_events', ['deliverableId'], {
      name: 'stage_events_deliverable',
    });

    await addConstraint(queryInterface, 'content_stage_events', {
      fields: ['deliverableId'],
      type: 'foreign key',
      name: 'stage_events_deliverable_fk',
      references: { table: 'content_deliverables', field: 'id' },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    /* ------------------------------------------------------------------ */
    /* Proposals                                                          */
    /* ------------------------------------------------------------------ */

    await createTable(queryInterface, 'client_proposals', {
      id: PK,
      clientId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      title: { type: Sequelize.STRING(191), allowNull: false },
      summary: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      /** What is being proposed, e.g. "4 videos + 8 stories per month". */
      scope: { type: Sequelize.TEXT, allowNull: true, defaultValue: null },
      status: { type: Sequelize.ENUM(...PROPOSAL_STATUS), allowNull: false, defaultValue: 'draft' },
      value: { type: Sequelize.DECIMAL(14, 2), allowNull: true, defaultValue: null },
      proposedStart: { type: Sequelize.DATEONLY, allowNull: true, defaultValue: null },
      respondedAt: { type: Sequelize.DATE, allowNull: true, defaultValue: null },
      createdAt,
      updatedAt,
      deletedAt,
    });

    await addIndex(queryInterface, 'client_proposals', ['clientId', 'status'], {
      name: 'proposals_client_status',
    });

    // Restrict, same reasoning as deliverables: a client with proposals should
    // not be deletable by accident from the clients table.
    await addConstraint(queryInterface, 'client_proposals', {
      fields: ['clientId'],
      type: 'foreign key',
      name: 'proposals_client_fk',
      references: { table: 'clients', field: 'id' },
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'client_proposals');
    await dropTableIfExists(queryInterface, 'content_stage_events');

    // Inverse of addColumns, column by column. removeColumn tolerates a column
    // that is already absent so a half-applied rollback can simply be re-run.
    for (const column of [
      'approvalNotes',
      'scriptBody',
      'brainstormNotes',
      'idea',
      'revisionCount',
      'assigneeId',
      'scheduledFor',
      'shootDate',
      'stage',
    ]) {
      await removeColumn(queryInterface, 'content_deliverables', column);
    }
  },
};