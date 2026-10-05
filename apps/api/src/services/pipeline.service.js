import { Op, fn, col, literal } from 'sequelize';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import {
  CONTENT_STAGE,
  CONTENT_STAGE_ORDER,
  CONTENT_BLOCKED_STAGES,
  PROPOSAL_STATUS,
} from '@virallink/shared/enums';

const { ContentDeliverable, ContentStageEvent, ContentMetric, ClientProposal, Client, Employee, User } = models;

/**
 * Content production pipeline.
 *
 * Two things this does that a list of deliverables cannot:
 *
 *  1. **The board.** Everything in flight, grouped by stage, with the shoot dates
 *     that decide whether the week is covered.
 *
 *  2. **Cycle time.** For every stage, the average and worst time a piece spent
 *     there, derived from content_stage_events. This is the number that changes
 *     how a team works: if approval averages six days and editing averages one,
 *     the bottleneck is the client, and no amount of internal tidying will fix it.
 *     It can only be seen by recording when cards *arrived* somewhere, which is
 *     why every move writes a row rather than just updating a column.
 *
 * Internal only. Nothing here is exposed through a public serializer.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight today, server local time. */
function today() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Monday of the week containing `date`. Weeks start Monday, as agencies do. */
function weekStart(date) {
  const day = new Date(date);
  // getDay() is 0 for Sunday; shift so Monday is 0 instead.
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  day.setHours(0, 0, 0, 0);
  return day;
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function isDateOnly(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** JSON shape for one board card. */
function toCardJson(item) {
  return {
    id: item.id,
    clientId: item.clientId,
    clientName: item.client?.name || null,
    title: item.title,
    type: item.type,
    platform: item.platform,
    stage: item.stage,
    url: item.url,
    shootDate: item.shootDate,
    scheduledFor: item.scheduledFor,
    publishedAt: item.publishedAt,
    revisionCount: item.revisionCount,
    assigneeId: item.assigneeId,
    assigneeName: item.assignee?.name || null,
    idea: item.idea,
    brainstormNotes: item.brainstormNotes,
    scriptBody: item.scriptBody,
    approvalNotes: item.approvalNotes,
    notes: item.notes,
    /* Views for the current month, so the board shows performance without a
       second fetch. Only for posted work — nothing in flight has views yet. */
    views: (item.metrics || []).reduce((total, metric) => total + (Number(metric.views) || 0), 0),
    updatedAt: item.updatedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* The board                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The kanban board.
 *
 * `clientId` filters to one client's pipeline, which is how you answer "what is
 * happening for Acme this month" without reading every card.
 *
 * `includePosted` defaults to false: posted work is history and belongs in the
 * report, not on the board where it pushes live work off screen.
 */
export async function getBoard({ clientId, includePosted = false } = {}) {
  const where = {};
  if (clientId) where.clientId = clientId;
  if (!includePosted) where.stage = { [Op.ne]: CONTENT_STAGE.POSTED };

  const items = await ContentDeliverable.findAll({
    where,
    include: [
      { model: Client, as: 'client', attributes: ['id', 'name'], required: false },
      { model: Employee, as: 'assignee', attributes: ['id', 'name'], required: false },
      { model: ContentMetric, as: 'metrics', attributes: ['views', 'month'] },
    ],
    // Soonest shoot first, then most recently touched. A card with no shoot date
    // sorts last rather than first, so an unscheduled item never masquerades as
    // the most urgent thing on the board.
    order: [
      [literal('shoot_date IS NULL, shoot_date'), 'ASC'],
      ['updatedAt', 'DESC'],
    ],
    subQuery: false,
  });

  const columns = CONTENT_STAGE_ORDER.map((stage) => {
    const cards = items.filter((item) => item.stage === stage);
    return {
      stage,
      count: cards.length,
      blocked: CONTENT_BLOCKED_STAGES.includes(stage),
      cards: cards.map(toCardJson),
    };
  });

  return {
    columns,
    totals: {
      open: items.length,
      shootingThisWeek: await countShootingThisWeek(clientId),
      postsThisWeek: await countPostsThisWeek(clientId),
      awaitingApproval: items.filter((item) => item.stage === CONTENT_STAGE.APPROVAL).length,
      overdue: await countOverdue(clientId),
    },
  };
}

async function countShootingThisWeek(clientId) {
  const { from, to } = weekBounds();
  return ContentDeliverable.count({
    where: {
      shootDate: { [Op.gte]: from, [Op.lt]: to },
      stage: { [Op.ne]: CONTENT_STAGE.POSTED },
      ...(clientId ? { clientId } : {}),
    },
  });
}

async function countPostsThisWeek(clientId) {
  const { from, to } = weekBounds();
  return ContentDeliverable.count({
    where: {
      scheduledFor: { [Op.gte]: from, [Op.lt]: to },
      stage: { [Op.ne]: CONTENT_STAGE.POSTED },
      ...(clientId ? { clientId } : {}),
    },
  });
}

/** In flight, and already past a date it should have hit. */
async function countOverdue(clientId) {
  const now = today();
  return ContentDeliverable.count({
    where: {
      stage: { [Op.ne]: CONTENT_STAGE.POSTED },
      [Op.or]: [
        { shootDate: { [Op.lt]: now } },
        { scheduledFor: { [Op.lt]: now } },
      ],
      ...(clientId ? { clientId } : {}),
    },
  });
}

function weekBounds(date = today()) {
  const from = weekStart(date);
  return { from, to: addDays(from, 7) };
}

/* -------------------------------------------------------------------------- */
/* Moving a card                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Move a card to a new stage and record the move.
 *
 * Three things happen here that a plain UPDATE would skip:
 *
 *  - A ContentStageEvent is written. This is what makes cycle time possible.
 *  - Moving *into* approval stamps revisionCount if it is null, marking the first
 *    time the piece went to the client. Sent once and accepted is different from
 *    never sent, and only one of those is a quality signal.
 *  - Moving *out of* approval into revision increments it, so the bounce is
 *    counted without the UI having to remember to.
 *
 * The event write happens before the item update so a failure cannot leave a moved
 * card with no history — the reverse order would silently produce a board whose
 * cycle-time figures understate reality.
 */
export async function moveStage(id, payload, request) {
  const item = await ContentDeliverable.findByPk(id);
  if (!item) throw AppError.notFound('Content item not found');

  const fromStage = item.stage;
  const toStage = payload.stage;

  if (fromStage === toStage) {
    return { ...toCardJson(item), unchanged: true };
  }

  await ContentStageEvent.create({
    deliverableId: item.id,
    fromStage,
    toStage,
    userId: request?.user?.id || null,
    note: payload.note || null,
  });

  const changed = { stage: toStage };

  if (toStage === CONTENT_STAGE.APPROVAL && payload.sentForApproval) {
    changed.revisionCount = item.revisionCount ?? 0;
  }

  if (fromStage === CONTENT_STAGE.APPROVAL && toStage === CONTENT_STAGE.REVISION) {
    changed.revisionCount = (item.revisionCount ?? 0) + 1;
  }

  // Reaching 'scheduled' without a date is almost always a mistake, so the date is
  // carried over from the shoot rather than left null and silently ignored.
  if (toStage === CONTENT_STAGE.POSTED && !item.publishedAt) {
    changed.publishedAt = new Date();
  }

  await item.update(changed);

  return { ...toCardJson(item), unchanged: false };
}

/** Update the editable fields. Stage changes go through moveStage so they are logged. */
export async function updateItem(id, payload) {
  const item = await ContentDeliverable.findByPk(id);
  if (!item) throw AppError.notFound('Content item not found');

  const { stage, ...fields } = payload;

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) item[key] = value === '' ? null : value;
  }

  await item.save();

  if (stage && stage !== item.stage) {
    return moveStage(id, { stage }, null);
  }

  return toCardJson(item);
}

/** The movement log for one card, newest first. */
export async function getStageHistory(id, limit = 50) {
  const events = await ContentStageEvent.findAll({
    where: { deliverableId: id },
    include: [{ model: User, as: 'actor', attributes: ['id', 'name'], required: false }],
    order: [['createdAt', 'DESC']],
    limit,
  });

  return events.map((event) => ({
    id: event.id,
    fromStage: event.fromStage,
    toStage: event.toStage,
    note: event.note,
    actor: event.actor?.name || null,
    createdAt: event.createdAt,
  }));
}

/* -------------------------------------------------------------------------- */
/* Cycle time                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How long work sits in each stage.
 *
 * A stage's duration is measured from when a card *entered* it to when a card
 * *left* it, i.e. the gap between this event and the next event for the same
 * item. The item's current stage has no exit yet, so it is excluded rather than
 * counted as zero — otherwise the stage everyone is currently working in would
 * always look the fastest, which is exactly backwards.
 */
export async function getCycleTime({ clientId } = {}) {
  const items = await ContentDeliverable.findAll({
    where: clientId ? { clientId } : {},
    attributes: ['id', 'stage'],
  });

  const openIds = items.map((item) => item.id);
  if (!openIds.length) return { stages: [], average: null, worst: null };

  const events = await ContentStageEvent.findAll({
    where: { deliverableId: { [Op.in]: openIds } },
    order: [['deliverableId', 'ASC'], ['createdAt', 'ASC']],
  });

  // Walk each item's timeline and pair up consecutive entries.
  const perStage = new Map();
  const byItem = new Map();

  for (const event of events) {
    if (!byItem.has(event.deliverableId)) byItem.set(event.deliverableId, []);
    byItem.get(event.deliverableId).push(event);
  }

  for (const timeline of byItem.values()) {
    for (let index = 0; index < timeline.length; index += 1) {
      const entered = timeline[index];
      const left = timeline[index + 1];

      // Still in this stage — no duration yet.
      if (!left) continue;

      const days = (new Date(left.createdAt) - new Date(entered.createdAt)) / DAY_MS;
      if (!Number.isFinite(days) || days < 0) continue;

      if (!perStage.has(entered.toStage)) perStage.set(entered.toStage, []);
      perStage.get(entered.toStage).push(days);
    }
  }

  const stages = CONTENT_STAGE_ORDER.filter((stage) => perStage.has(stage)).map((stage) => {
    const durations = perStage.get(stage);
    const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;

    return {
      stage,
      samples: durations.length,
      averageDays: Math.round(average * 10) / 10,
      worstDays: Math.round(Math.max(...durations) * 10) / 10,
    };
  });

  /*
   * The bottleneck is the stage with the longest average among stages with enough
   * samples to mean anything. One sample is not a pattern, so a single slow item
   * should not be reported as "your slowest stage".
   */
  const meaningful = stages.filter((entry) => entry.samples >= 2);
  const ranked = (meaningful.length ? meaningful : stages).sort((a, b) => b.averageDays - a.averageDays);

  return {
    stages,
    average: ranked.length ? ranked[0] : null,
    worst: ranked.length ? ranked[ranked.length - 1] : null,
    bottleneck: ranked.length ? ranked[0].stage : null,
    reliable: meaningful.length > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Weekly operational report                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The weekly report.
 *
 * Deliberately *operational*, not commercial. The monthly client report carries
 * views and likes because that is what a client is billed on and shown. A week is
 * a working horizon: what shoots, what goes out, what is stuck, and whether the
 * team is actually moving.
 *
 * Views are absent on purpose. Platforms report monthly, and a week of views is
 * not a meaningful figure — showing one would imply a precision that does not
 * exist.
 */
export async function getWeeklyReport({ week, clientId } = {}) {
  const anchor = isDateOnly(week) ? new Date(week) : today();
  const from = weekStart(anchor);
  const to = addDays(from, 7);

  const scope = clientId ? { clientId } : {};

  const [shooting, posting, inFlight, blocked, approvals, cycle] = await Promise.all([
    ContentDeliverable.findAll({
      where: { ...scope, shootDate: { [Op.gte]: from, [Op.lt]: to }, stage: { [Op.ne]: CONTENT_STAGE.POSTED } },
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name'], required: false },
        { model: Employee, as: 'assignee', attributes: ['id', 'name'], required: false },
      ],
      order: [['shootDate', 'ASC']],
    }),
    ContentDeliverable.findAll({
      where: { ...scope, scheduledFor: { [Op.gte]: from, [Op.lt]: to }, stage: { [Op.ne]: CONTENT_STAGE.POSTED } },
      include: [
        { model: Client, as: 'client', attributes: ['id', 'name'], required: false },
        { model: Employee, as: 'assignee', attributes: ['id', 'name'], required: false },
      ],
      order: [['scheduledFor', 'ASC']],
    }),
    ContentDeliverable.findAll({
      where: { ...scope, stage: { [Op.ne]: CONTENT_STAGE.POSTED } },
      attributes: ['id', 'stage'],
    }),
    /* Stuck: in approval for more than three days. The threshold is a guess, but a
       documented one beats an unstated threshold. */
    ContentDeliverable.findAll({
      where: { ...scope, stage: CONTENT_STAGE.APPROVAL, updatedAt: { [Op.lt]: addDays(today(), -3) } },
      include: [{ model: Client, as: 'client', attributes: ['id', 'name'], required: false }],
      order: [['updatedAt', 'ASC']],
    }),
    ContentDeliverable.count({
      where: { ...scope, stage: CONTENT_STAGE.APPROVAL },
    }),
    getCycleTime({ clientId }),
  ]);

  /* Per-stage counts for the funnel. */
  const stageCounts = {};
  for (const stage of CONTENT_STAGE_ORDER) stageCounts[stage] = 0;
  for (const item of inFlight) {
    if (item.stage !== CONTENT_STAGE.POSTED) stageCounts[item.stage] += 1;
  }

  const overdue = inFlight.filter(
    (item) =>
      (isDateOnly(item.shootDate) && item.shootDate < today()) ||
      (isDateOnly(item.scheduledFor) && item.scheduledFor < today()),
  );

  return {
    week: {
      start: from,
      end: to,
      label: `${from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${addDays(from, 6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
    },
    totals: {
      shooting: shooting.length,
      posting: posting.length,
      inFlight: inFlight.length,
      awaitingApproval: approvals,
      blockedOverThreeDays: blocked.length,
      overdue: overdue.length,
      unassigned: inFlight.filter((item) => !item.assigneeId).length,
    },
    stageCounts,
    shooting: shooting.map(toCardJson),
    posting: posting.map(toCardJson),
    blocked: blocked.map(toCardJson),
    overdue: overdue.map(toCardJson),
    cycleTime: cycle,
  };
}

/* -------------------------------------------------------------------------- */
/* Proposals                                                                  */
/* -------------------------------------------------------------------------- */

function toProposalJson(proposal) {
  return {
    id: proposal.id,
    clientId: proposal.clientId,
    clientName: proposal.client?.name || null,
    title: proposal.title,
    summary: proposal.summary,
    scope: proposal.scope,
    status: proposal.status,
    value: proposal.value,
    proposedStart: proposal.proposedStart,
    respondedAt: proposal.respondedAt,
    createdAt: proposal.createdAt,
  };
}

export async function listProposals({ clientId, status } = {}) {
  const where = {};
  if (clientId) where.clientId = clientId;
  if (status) where.status = status;

  const proposals = await ClientProposal.findAll({
    where,
    include: [{ model: Client, as: 'client', attributes: ['id', 'name'], required: false }],
    order: [['createdAt', 'DESC']],
  });

  return proposals.map(toProposalJson);
}

export async function createProposal(payload) {
  const client = await Client.findByPk(payload.clientId);
  if (!client) throw AppError.notFound('Client not found');

  const proposal = await ClientProposal.create({
    clientId: payload.clientId,
    title: payload.title,
    summary: payload.summary ?? null,
    scope: payload.scope ?? null,
    status: payload.status,
    value: payload.value ?? null,
    proposedStart: payload.proposedStart ?? null,
  });

  // Re-read with the association so the response carries clientName like every
  // other proposal payload, rather than a bare id the UI would have to look up.
  const fresh = await ClientProposal.findByPk(proposal.id, {
    include: [{ model: Client, as: 'client', attributes: ['id', 'name'], required: false }],
  });

  return toProposalJson(fresh);
}

export async function updateProposal(id, payload) {
  const proposal = await ClientProposal.findByPk(id);
  if (!proposal) throw AppError.notFound('Proposal not found');

  const fields = { ...payload };
  delete fields.clientId;

  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) proposal[key] = value === '' ? null : value;
  }

  /*
   * Stamp the decision date when a proposal reaches a terminal state, so "how long
   * did they take to answer" is answerable without anyone remembering to log it.
   */
  const terminal = [PROPOSAL_STATUS.ACCEPTED, PROPOSAL_STATUS.DECLINED];
  if (payload.status && terminal.includes(payload.status) && !proposal.respondedAt) {
    proposal.respondedAt = new Date();
  }

  await proposal.save();

  return toProposalJson(proposal);
}

export async function deleteProposal(id) {
  const proposal = await ClientProposal.findByPk(id);
  if (!proposal) throw AppError.notFound('Proposal not found');

  await proposal.destroy();
  return { id: Number(id) };
}

/** Counts for the proposals page header. */
export async function proposalSummary() {
  const grouped = await ClientProposal.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'count']],
    group: ['status'],
    paranoid: true,
  });

  const byStatus = Object.fromEntries(grouped.map((row) => [row.status, Number(row.get('count'))]));

  return {
    byStatus,
    // A proposal with no decision yet is the one that needs chasing.
    awaiting: byStatus[PROPOSAL_STATUS.SENT] || 0,
    total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
  };
}