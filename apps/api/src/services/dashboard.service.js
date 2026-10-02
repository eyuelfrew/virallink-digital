import { Op, fn, col, literal } from 'sequelize';
import { models } from '../models/index.js';
import AppError from '../utils/AppError.js';
import { cached, cacheKey } from '../utils/cache.js';
import {
  INQUIRY_STATUS,
  CLIENT_STATUS,
  PROJECT_STATUS,
  TRANSACTION_TYPE,
  TRANSACTION_STATUS,
  INVOICE_STATUS,
  EMPLOYMENT_STATUS,
  SHAREHOLDER_STATUS,
} from '@virallink/shared/enums';
import { sumCents, outstandingCents } from '../utils/money.js';

/**
 * Dashboard metrics.
 *
 * Aggregations run as SQL rather than by loading rows into JavaScript. On a
 * shared host with a modest database the difference is large, and the whole
 * dashboard would otherwise slow down as history accumulates.
 *
 * Every financial figure is returned in integer cents. The client formats them;
 * the server never sends a float it has done arithmetic on.
 */

const {
  Client,
  Project,
  Employee,
  Shareholder,
  FinancialTransaction,
  FinancialCategory,
  Invoice,
  ContactInquiry,
  ActivityLog,
  Service,
} = models;

/** Money columns come back as strings; normalise to integer cents. */
function cents(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.trunc(number * 100) : 0;
}

function startOfMonth(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKey(date) {
  return new Date(date).toISOString().slice(0, 7);
}

/**
 * The full dashboard payload.
 *
 * Metrics that need several queries run in parallel. Each section is computed
 * independently and cached separately, so one slow aggregate cannot delay the
 * whole dashboard.
 */
export async function getDashboardSummary({ months = 12 } = {}) {
  const [
    counts,
    finance,
    trends,
    statusBreakdown,
    recentActivity,
    recentInquiries,
    deadlines,
    serviceDistribution,
  ] = await Promise.all([
    getCounts(),
    getFinanceSummary(),
    getMonthlyTrend(months),
    getStatusBreakdown(),
    getRecentActivity(8),
    getRecentInquiries(5),
    getUpcomingDeadlines(6),
    getServiceDistribution(),
  ]);

  return { counts, finance, trends, statusBreakdown, recentActivity, recentInquiries, deadlines, serviceDistribution };
}

/* -------------------------------------------------------------------------- */
/* Headline counts                                                             */
/* -------------------------------------------------------------------------- */

async function getCounts() {
  const [totalClients, activeClients, totalProjects, activeProjects, completedProjects, totalEmployees, totalShareholders] =
    await Promise.all([
      Client.count(),
      Client.count({ where: { status: CLIENT_STATUS.ACTIVE } }),
      Project.count(),
      Project.count({
        where: { status: { [Op.ne]: PROJECT_STATUS.COMPLETED } },
      }),
      Project.count({ where: { status: PROJECT_STATUS.COMPLETED } }),
      Employee.count({ where: { employmentStatus: EMPLOYMENT_STATUS.ACTIVE } }),
      Shareholder.count({ where: { status: SHAREHOLDER_STATUS.ACTIVE } }),
    ]);

  // Unread inquiries drive the nav badge, so it is worth its own count.
  const unreadInquiries = await ContactInquiry.count({
    where: { isRead: false, isArchived: false, status: INQUIRY_STATUS.NEW },
  });

  // Ownership totals are useful for a shareholder view but must never be
  // returned to a role without shareholder.read.
  return {
    clients: { total: totalClients, active: activeClients },
    projects: { total: totalProjects, active: activeProjects, completed: completedProjects },
    employees: totalEmployees,
    shareholders: totalShareholders,
    inquiries: { unread: unreadInquiries },
  };
}

/* -------------------------------------------------------------------------- */
/* Finance                                                                    */
/* -------------------------------------------------------------------------- */

async function getFinanceSummary() {
  const monthStart = startOfMonth();

  const [monthlyTotals, outstandingRows] = await Promise.all([
    FinancialTransaction.findAll({
      attributes: ['type', 'amount'],
      where: {
        status: TRANSACTION_STATUS.COMPLETED,
        transactionDate: { [Op.gte]: monthStart },
      },
      raw: true,
    }),
    Invoice.findAll({
      attributes: ['total', 'paidAmount', 'status'],
      where: {
        status: { [Op.in]: [INVOICE_STATUS.ISSUED, INVOICE_STATUS.PARTIALLY_PAID, INVOICE_STATUS.OVERDUE] },
      },
      raw: true,
    }),
  ]);

  const monthIncomeCents = sumCents(monthlyTotals.filter((t) => t.type === TRANSACTION_TYPE.INCOME).map((t) => cents(t.amount)));
  const monthExpenseCents = sumCents(monthlyTotals.filter((t) => t.type === TRANSACTION_TYPE.EXPENSE).map((t) => cents(t.amount)));

  // Outstanding balance is computed from totals, not from a stored column, so it
  // can never drift out of step with the payments table.
  const outstandingCentsTotal = sumCents(
    outstandingRows.map((invoice) => outstandingCents(cents(invoice.total), cents(invoice.paidAmount))),
  );

  const lifetimeTotals = await FinancialTransaction.findAll({
    attributes: ['type', 'amount'],
    where: { status: TRANSACTION_STATUS.COMPLETED },
    raw: true,
  });

  const lifetimeIncomeCents = sumCents(lifetimeTotals.filter((t) => t.type === TRANSACTION_TYPE.INCOME).map((t) => cents(t.amount)));
  const lifetimeExpenseCents = sumCents(lifetimeTotals.filter((t) => t.type === TRANSACTION_TYPE.EXPENSE).map((t) => cents(t.amount)));

  return {
    currency: 'ETB',
    month: {
      incomeCents: monthIncomeCents,
      expenseCents: monthExpenseCents,
      profitCents: monthIncomeCents - monthExpenseCents,
    },
    lifetime: {
      incomeCents: lifetimeIncomeCents,
      expenseCents: lifetimeExpenseCents,
      profitCents: lifetimeIncomeCents - lifetimeExpenseCents,
    },
    outstandingCents: outstandingCentsTotal,
  };
}

/* -------------------------------------------------------------------------- */
/* Monthly trend                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Income, expense and profit per month for the trend chart.
 *
 * Rows are bucketed in SQL with DATE_FORMAT and the gaps are filled in
 * JavaScript, so a month with no transactions appears as a zero rather than
 * making the chart render an uneven x-axis.
 */
async function getMonthlyTrend(months = 12) {
  const start = startOfMonth();
  start.setUTCMonth(start.getUTCMonth() - (months - 1));

  // `raw: true` sends these strings straight to MySQL, so they must be physical
  // column names, not model attribute names.
  const monthExpression = fn('DATE_FORMAT', literal('transaction_date'), '%Y-%m');

  const rows = await FinancialTransaction.findAll({
    attributes: [
      [monthExpression, 'month'],
      'type',
      [fn('SUM', literal('amount')), 'total'],
    ],
    where: {
      status: TRANSACTION_STATUS.COMPLETED,
      transactionDate: { [Op.gte]: start },
    },
    group: [monthExpression, 'type'],
    order: [[monthExpression, 'ASC']],
    raw: true,
  });

  const byMonth = new Map(rows.map((row) => [row.month, row]));

  const series = [];
  for (let offset = 0; offset < months; offset += 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1));
    const key = monthKey(date);
    const row = byMonth.get(key);

    const incomeCents = row?.type === TRANSACTION_TYPE.INCOME ? cents(row.total) : 0;
    const expenseCents = row?.type === TRANSACTION_TYPE.EXPENSE ? cents(row.total) : 0;

    series.push({
      month: key,
      label: date.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      incomeCents,
      expenseCents,
      profitCents: incomeCents - expenseCents,
    });
  }

  return series;
}

/* -------------------------------------------------------------------------- */
/* Distributions                                                              */
/* -------------------------------------------------------------------------- */

// Aggregations use raw: true, so expressions reference physical column names.
async function getStatusBreakdown() {
  const [projectRows, clientRows] = await Promise.all([
    Project.findAll({
      attributes: ['status', [fn('COUNT', literal('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
    Client.findAll({
      attributes: ['status', [fn('COUNT', literal('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
  ]);

  return {
    projects: projectRows.map((row) => ({ status: row.status, count: Number(row.count) })),
    clients: clientRows.map((row) => ({ status: row.status, count: Number(row.count) })),
  };
}

/** Projects per service, for the distribution chart. */
async function getServiceDistribution() {
  const rows = await Project.findAll({
    attributes: ['serviceId', [fn('COUNT', literal('id')), 'count']],
    where: { isPublished: true, serviceId: { [Op.ne]: null } },
    group: ['serviceId'],
    raw: true,
  });

  if (!rows.length) return [];

  const services = await Service.findAll({
    where: { id: { [Op.in]: rows.map((r) => r.serviceId) } },
    attributes: ['id', 'title', 'slug'],
  });

  const titleById = new Map(services.map((s) => [s.id, s]));

  return rows
    .map((row) => ({
      serviceId: row.serviceId,
      title: titleById.get(row.serviceId)?.title || 'Uncategorised',
      slug: titleById.get(row.serviceId)?.slug || null,
      count: Number(row.count),
    }))
    .sort((a, b) => b.count - a.count);
}

/* -------------------------------------------------------------------------- */
/* Feeds                                                                      */
/* -------------------------------------------------------------------------- */

async function getRecentActivity(limit = 8) {
  return cached(cacheKey('dashboard', 'activity', limit), 30, () =>
    ActivityLog.findAll({
      order: [['createdAt', 'DESC']],
      limit,
      raw: true,
    }).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entity: row.entity,
        entityId: row.entityId,
        userEmail: row.userEmail,
        createdAt: row.createdAt,
      })),
    ),
  );
}

async function getRecentInquiries(limit = 5) {
  const rows = await ContactInquiry.findAll({
    // High-spam-score rows are hidden so the feed shows genuine leads.
    where: { isArchived: false, spamScore: { [Op.lt]: 60 } },
    order: [['createdAt', 'DESC']],
    limit,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    company: row.company,
    subject: row.subject,
    status: row.status,
    isRead: row.isRead,
    createdAt: row.createdAt,
  }));
}

/**
 * Projects approaching or past their deadline, plus overdue invoices.
 * Both are "things that need attention today", which is why they share a tile.
 */
async function getUpcomingDeadlines(limit = 6) {
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 30);

  const [projects, invoices] = await Promise.all([
    Project.findAll({
      where: {
        deadlineAt: { [Op.ne]: null, [Op.lte]: horizon },
        status: { [Op.notIn]: [PROJECT_STATUS.COMPLETED, PROJECT_STATUS.CANCELLED] },
      },
      order: [['deadlineAt', 'ASC']],
      limit,
    }),
    Invoice.findAll({
      where: {
        status: { [Op.in]: [INVOICE_STATUS.ISSUED, INVOICE_STATUS.PARTIALLY_PAID] },
        dueDate: { [Op.lte]: horizon },
      },
      order: [['dueDate', 'ASC']],
      limit,
    }),
  ]);

  return [
    ...projects.map((project) => ({
      type: 'project',
      id: project.id,
      label: project.title,
      dueDate: project.deadlineAt,
      status: project.status,
      outstandingCents: null,
    })),
    ...invoices.map((invoice) => ({
      type: 'invoice',
      id: invoice.id,
      label: invoice.invoiceNumber,
      dueDate: invoice.dueDate,
      status: invoice.status,
      outstandingCents: outstandingCents(cents(invoice.total), cents(invoice.paidAmount)),
    })),
  ]
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A financial report over an arbitrary range, for the reports page.
 * Returns cents and a per-category breakdown.
 */
export async function getFinanceReport({ from, to, type = null } = {}) {
  if (!from || !to) throw AppError.badRequest('Both a start and end date are required');
  if (new Date(from) > new Date(to)) throw AppError.badRequest('The start date must come before the end date');

  const where = {
    transactionDate: { [Op.between]: [from, to] },
    status: TRANSACTION_STATUS.COMPLETED,
  };
  if (type) where.type = type;

  // raw: true sends these expressions straight to MySQL, so they name physical
  // columns rather than model attributes.
  const [totals, byCategory] = await Promise.all([
    FinancialTransaction.findAll({
      attributes: [
        'type',
        [fn('SUM', literal('amount')), 'total'],
        [fn('COUNT', literal('id')), 'count'],
      ],
      where,
      group: ['type'],
      raw: true,
    }),
    FinancialTransaction.findAll({
      attributes: [
        'categoryId',
        [fn('SUM', literal('amount')), 'total'],
        [fn('COUNT', literal('id')), 'count'],
      ],
      where,
      group: ['categoryId'],
      raw: true,
    }),
  ]);

  const incomeCents = cents(totals.find((t) => t.type === TRANSACTION_TYPE.INCOME)?.total);
  const expenseCents = cents(totals.find((t) => t.type === TRANSACTION_TYPE.EXPENSE)?.total);

  const categories = byCategory.filter((row) => row.categoryId);
  let namedCategories = [];
  if (categories.length) {
    const found = await FinancialCategory.findAll({
      where: { id: { [Op.in]: categories.map((c) => c.categoryId) } },
      attributes: ['id', 'name', 'type'],
    });
    const byId = new Map(found.map((c) => [c.id, c]));
    namedCategories = categories.map((row) => ({
      categoryId: row.categoryId,
      name: byId.get(row.categoryId)?.name || 'Uncategorised',
      type: byId.get(row.categoryId)?.type || null,
      totalCents: cents(row.total),
      count: Number(row.count),
    }));
  }

  return {
    from,
    to,
    currency: 'ETB',
    incomeCents,
    expenseCents,
    profitCents: incomeCents - expenseCents,
    transactionCount: totals.reduce((sum, t) => sum + Number(t.count), 0),
    byCategory: namedCategories.sort((a, b) => b.totalCents - a.totalCents),
  };
}

export { getCounts, getFinanceSummary, getMonthlyTrend };
export default getDashboardSummary;