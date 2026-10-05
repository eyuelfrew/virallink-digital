import { Op, fn, col } from 'sequelize';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { DELIVERABLE_TYPE, METRIC_PLATFORM } from '@virallink/shared/enums';

const { Client, ContentDeliverable, ContentMetric, ContentStageEvent } = models;

/**
 * Client reporting.
 *
 * Internal only, and never exposed through a public serializer: a report names a
 * client, their contract value and their commercial performance.
 *
 * Two ideas hold this together:
 *
 *  1. Production and performance are counted separately. "Videos created" comes
 *     from content_deliverables filtered by publishedAt falling in the month.
 *     "Views" comes from content_metrics, and a video published in June can have
 *     views in July. Conflating them is the single easiest way to produce a
 *     report that is confidently wrong.
 *
 *  2. A metric row is keyed by (deliverable, month, platform). "Views" is
 *     therefore a *monthly* figure, not a running total — which matches how
 *     platforms actually report and how agencies talk to clients. Nothing sums a
 *     month's views into a lifetime total, because that would double-count a
 *     cumulative platform figure the moment two months were added together.
 */

/** Current month as 'YYYY-MM' in server local time. */
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Step a 'YYYY-MM' string back by `count` months. */
export function shiftMonth(month, count) {
  const [year, monthNumber] = month.split('-').map(Number);
  // Date.UTC avoids month arithmetic wrapping at year boundaries in local time.
  const date = new Date(Date.UTC(year, monthNumber - 1 - count, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Half-open range covering a whole 'YYYY-MM' month, as Date bounds. */
function monthBounds(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    from: new Date(Date.UTC(year, monthNumber - 1, 1)),
    // First instant of the *next* month, so 31 December cannot be missed.
    to: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

async function assertClient(clientId) {
  const client = await Client.findByPk(clientId);
  if (!client) throw AppError.notFound('Client not found');
  return client;
}

/** JSON shape for one deliverable, with its metrics attached. */
function toDeliverableJson(deliverable) {
  return {
    id: deliverable.id,
    clientId: deliverable.clientId,
    title: deliverable.title,
    type: deliverable.type,
    platform: deliverable.platform,
    url: deliverable.url,
    publishedAt: deliverable.publishedAt,
    notes: deliverable.notes,
    metrics: (deliverable.metrics || []).map((metric) => ({
      id: metric.id,
      month: metric.month,
      platform: metric.platform,
      views: metric.views,
      likes: metric.likes,
      comments: metric.comments,
      shares: metric.shares,
      watchHours: metric.watchHours === null ? null : Number(metric.watchHours),
      source: metric.source,
    })),
  };
}

/**
 * Sum one counter across metric rows, skipping nulls.
 *
 * Nulls are skipped rather than coerced to 0 so that "we have not measured
 * impressions" does not silently become "impressions were zero" in a total. If
 * every row is null the total is 0 as well, since there is nothing to sum, but
 * `measured` below records whether any row actually carried a figure.
 */
function sumCounter(rows, field) {
  let total = 0;
  let measured = false;

  for (const row of rows) {
    const value = Number(row[field]);
    if (Number.isFinite(value)) {
      total += value;
      measured = true;
    }
  }

  return { total, measured };
}

/* -------------------------------------------------------------------------- */
/* Deliverables                                                               */
/* -------------------------------------------------------------------------- */

export async function listDeliverables(query = {}) {
  const { page = 1, pageSize = 20, search, month, type, platform, clientId } = query;

  const where = {};
  if (clientId) where.clientId = clientId;
  if (type) where.type = type;
  if (platform) where.platform = platform;

  if (month) {
    const { from, to } = monthBounds(month);
    // Filter on publishedAt, not createdAt: "what went out in October" is the
    // question, and a video entered in November for an October slot is real work.
    where.publishedAt = { [Op.gte]: from, [Op.lt]: to };
  }

  if (search) {
    where.title = { [Op.like]: `%${search}%` };
  }

  const { rows, count } = await ContentDeliverable.findAndCountAll({
    where,
    include: [{ model: ContentMetric, as: 'metrics' }],
    order: [
      ['publishedAt', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
    subQuery: false,
  });

  return {
    rows: rows.map(toDeliverableJson),
    meta: { page, pageSize, total: count, totalPages: Math.max(1, Math.ceil(count / pageSize)) },
  };
}

export async function createDeliverable(payload) {
  await assertClient(payload.clientId);

  const deliverable = await ContentDeliverable.create({
    clientId: payload.clientId,
    title: payload.title,
    type: payload.type,
    platform: payload.platform,
    url: payload.url || null,
    publishedAt: payload.publishedAt || null,
    mediaId: payload.mediaId ?? null,
    notes: payload.notes ?? null,
    /*
     * Pipeline placement. Defaults to the model's `posted` when omitted, which is
     * correct for logging work after the fact. Creating a board card has to be able
     * to say so, otherwise new cards land in `posted` and vanish from the board.
     *
     * The first stage entry is recorded here rather than left to the first move,
     * because without it the card has no arrival time and cycle time for its
     * opening stage can never be computed.
     */
    ...(payload.stage
      ? {
          stage: payload.stage,
          shootDate: payload.shootDate || null,
          scheduledFor: payload.scheduledFor || null,
          assigneeId: payload.assigneeId ?? null,
          idea: payload.idea ?? null,
          brainstormNotes: payload.brainstormNotes ?? null,
          scriptBody: payload.scriptBody ?? null,
        }
      : {}),
  });

  if (payload.stage) {
    await ContentStageEvent.create({
      deliverableId: deliverable.id,
      fromStage: null,
      toStage: payload.stage,
      userId: null,
      note: 'Created',
    });
  }

  return toDeliverableJson(deliverable);
}

export async function updateDeliverable(id, payload) {
  const deliverable = await ContentDeliverable.findByPk(id);
  if (!deliverable) throw AppError.notFound('Deliverable not found');

  if (payload.clientId !== undefined) {
    await assertClient(payload.clientId);
    deliverable.clientId = payload.clientId;
  }

  for (const field of ['title', 'type', 'platform', 'url', 'publishedAt', 'notes', 'mediaId']) {
    if (payload[field] !== undefined) deliverable[field] = payload[field];
  }

  await deliverable.save();

  const fresh = await ContentDeliverable.findByPk(id, {
    include: [{ model: ContentMetric, as: 'metrics' }],
  });

  return toDeliverableJson(fresh);
}

export async function deleteDeliverable(id) {
  const deliverable = await ContentDeliverable.findByPk(id);
  if (!deliverable) throw AppError.notFound('Deliverable not found');

  // Metrics cascade at the database level, so no orphaned figures survive.
  await deliverable.destroy();

  return { id: Number(id) };
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Create or update the figures for one deliverable in one month.
 *
 * Deliberately an upsert keyed on (deliverableId, month, platform) rather than a
 * plain create: staff re-entering a corrected figure should not be told the month
 * already exists, and two people entering the same month must not produce two
 * rows that the report then adds together.
 */
export async function upsertMetric(payload, request) {
  const deliverable = await ContentDeliverable.findByPk(payload.deliverableId);
  if (!deliverable) throw AppError.notFound('Deliverable not found');

  const existing = await ContentMetric.findOne({
    where: {
      deliverableId: payload.deliverableId,
      month: payload.month,
      platform: payload.platform,
    },
  });

  const fields = {
    views: payload.views ?? null,
    likes: payload.likes ?? null,
    comments: payload.comments ?? null,
    shares: payload.shares ?? null,
    watchHours: payload.watchHours ?? null,
    source: payload.source || 'manual',
  };

  if (existing) {
    // A partial edit should blank only the counters it mentions. `undefined` means
    // "leave alone"; an explicit null from the form means "not measured".
    for (const [key, value] of Object.entries(fields)) {
      if (payload[key] !== undefined) existing[key] = value;
    }
    await existing.save();
    return { ...toMetricJson(existing), updated: true };
  }

  const created = await ContentMetric.create({
    deliverableId: payload.deliverableId,
    month: payload.month,
    platform: payload.platform,
    ...fields,
  });

  void request;
  return { ...toMetricJson(created), updated: false };
}

function toMetricJson(metric) {
  return {
    id: metric.id,
    deliverableId: metric.deliverableId,
    month: metric.month,
    platform: metric.platform,
    views: metric.views,
    likes: metric.likes,
    comments: metric.comments,
    shares: metric.shares,
    watchHours: metric.watchHours === null ? null : Number(metric.watchHours),
    source: metric.source,
  };
}

export async function deleteMetric(id) {
  const metric = await ContentMetric.findByPk(id);
  if (!metric) throw AppError.notFound('Metric not found');

  await metric.destroy();
  return { id: Number(id) };
}

/* -------------------------------------------------------------------------- */
/* The report itself                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Build the client report for one month.
 *
 * Returns four things the UI needs and cannot derive client-side:
 *
 *   headline   — counts of what was produced, and totals for the month
 *   trend      — the same headline totals for N trailing months, for the chart
 *   platforms  — views split by platform, for the pie/bar
 *   top        — the best-performing deliverables, which is the part a client
 *                actually reads
 *
 * Every counter carries a `measured` flag so the UI can render "not measured"
 * instead of a confident 0.
 */
export async function buildClientReport(clientId, query = {}) {
  const client = await assertClient(clientId);

  const month = query.month || currentMonth();
  const monthCount = Math.min(Math.max(Number(query.months) || 6, 1), 12);

  const months = [];
  for (let back = monthCount - 1; back >= 0; back -= 1) {
    months.push(shiftMonth(month, back));
  }

  const firstMonth = months[0];
  const lastBounds = monthBounds(month);

  const [deliverables, metricRows] = await Promise.all([
    ContentDeliverable.findAll({
      where: {
        clientId,
        publishedAt: { [Op.gte]: monthBounds(firstMonth).from, [Op.lt]: lastBounds.to },
      },
      include: [{ model: ContentMetric, as: 'metrics' }],
      order: [['publishedAt', 'DESC']],
    }),
    ContentMetric.findAll({
      where: { month: { [Op.in]: months } },
      include: [
        {
          model: ContentDeliverable,
          as: 'deliverable',
          attributes: ['id', 'title', 'type', 'platform', 'clientId'],
          required: true,
          where: { clientId },
        },
      ],
    }),
  ]);

  /*
   * Production: what went out, and of what kind.
   *
   * Counted from the *selected month only*. The fetch above spans the whole trend
   * window so the chart has something to plot, and using that same set for the
   * headline would report the window's total under this month's heading — telling
   * a client they received five videos in October when they received three.
   */
  const inMonth = deliverables.filter((row) => row.publishedAt && monthOf(row) === month);

  const producedByType = {};
  for (const type of Object.values(DELIVERABLE_TYPE)) producedByType[type] = 0;
  for (const deliverable of inMonth) {
    producedByType[deliverable.type] = (producedByType[deliverable.type] || 0) + 1;
  }

  const publishedCount = inMonth.length;
  const totalProduced = inMonth.length;

  /* Totals per month, so the trend chart and the headline agree by construction. */
  const trend = months.map((key) => {
    const rows = metricRows.filter((row) => row.month === key);
    return {
      month: key,
      produced: deliverables.filter((row) => row.publishedAt && monthOf(row) === key).length,
      views: sumCounter(rows, 'views'),
      likes: sumCounter(rows, 'likes'),
      comments: sumCounter(rows, 'comments'),
      shares: sumCounter(rows, 'shares'),
      watchHours: sumCounter(rows, 'watchHours'),
    };
  });

  const thisMonthRows = metricRows.filter((row) => row.month === month);

  const totals = {
    views: sumCounter(thisMonthRows, 'views'),
    likes: sumCounter(thisMonthRows, 'likes'),
    comments: sumCounter(thisMonthRows, 'comments'),
    shares: sumCounter(thisMonthRows, 'shares'),
    watchHours: sumCounter(thisMonthRows, 'watchHours'),
  };

  /* Platform split for the selected month. */
  const byPlatform = [];
  for (const platform of Object.values(METRIC_PLATFORM)) {
    const rows = thisMonthRows.filter((row) => row.platform === platform);
    if (!rows.length) continue;
    const views = sumCounter(rows, 'views');
    byPlatform.push({ platform, views: views.total, measured: views.measured, deliverables: rows.length });
  }
  byPlatform.sort((a, b) => b.views - a.views);

  /* Top performers, ranked on views. */
  const top = thisMonthRows
    .filter((row) => Number.isFinite(Number(row.views)))
    .sort((a, b) => Number(b.views) - Number(a.views))
    .slice(0, 5)
    .map((row) => ({
      deliverableId: row.deliverableId,
      title: row.deliverable?.title || 'Untitled',
      type: row.deliverable?.type || null,
      platform: row.platform,
      views: Number(row.views),
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
    }));

  /* Month-over-month change, only when the previous month was actually measured.
     Comparing against an unmeasured month would show a meaningless +100%. */
  const previous = trend[trend.length - 2];
  const current = trend[trend.length - 1];
  const delta = previous && previous.views.measured
    ? {
        viewsPercent: percentChange(previous.views.total, current.views.total),
        producedChange: current.produced - previous.produced,
      }
    : null;

  return {
    month,
    months: monthCount,
    client: {
      id: client.id,
      name: client.name,
      industry: client.industry,
      website: client.website,
      status: client.status,
      contactPerson: client.contactPerson,
    },
    headline: {
      totalProduced,
      publishedCount,
      videosProduced: producedByType[DELIVERABLE_TYPE.VIDEO] || 0,
      producedByType,
      totals,
    },
    trend,
    platforms: byPlatform,
    top,
    delta,
    /* Everything the report page lists, scoped to the selected month. */
    deliverables: inMonth.map(toDeliverableJson),
    generatedAt: new Date().toISOString(),
  };
}

/** The 'YYYY-MM' a deliverable was published in, in server local time. */
function monthOf(deliverable) {
  if (!deliverable.publishedAt) return null;
  const date = new Date(deliverable.publishedAt);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Percentage change, or null when there is no meaningful baseline.
 *
 * Returns null rather than Infinity or 0 when the previous figure was zero: "went
 * from nothing to something" is a real situation but not a percentage, and
 * printing a number there is the kind of thing a client notices.
 */
function percentChange(previous, current) {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Aggregate counter totals for a client across all months, for the dashboard. */
export async function clientTotals(clientId) {
  const metricRows = await ContentMetric.findAll({
    where: {},
    include: [
      {
        model: ContentDeliverable,
        as: 'deliverable',
        attributes: ['id', 'clientId'],
        required: true,
        where: { clientId },
      },
    ],
  });

  const views = sumCounter(metricRows, 'views');
  const likes = sumCounter(metricRows, 'likes');

  const [produced] = await ContentDeliverable.findAll({
    where: { clientId },
    attributes: [fn('COUNT', col('id')), 'count'],
    raw: true,
  });

  return {
    produced: Number(produced?.count || 0),
    views: views.total,
    viewsMeasured: views.measured,
    likes: likes.total,
  };
}