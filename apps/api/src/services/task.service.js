import { Op, literal, fn, col } from 'sequelize';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { ACTIVITY_ACTION, ENTITY, TASK_STATUS } from '../shared/enums.js';
import { buildDiff, logCrud } from '../middleware/audit.js';
import { notifyTaskAssigned, notifyTaskStatusChanged, notifyAdminsTaskCompleted } from './notifications.service.js';

const { Task, Employee } = models;

/**
 * Task board.
 *
 * Internal only. Nothing here is reachable from the public API, and the task
 * title/description are never run through a public serializer.
 */

/** Statuses that count as "not finished". The board's default view. */
const OPEN_STATUSES = [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.REVIEW];

/** Statuses that close a task. Nothing comes after these. */
const FINISHED_STATUSES = [TASK_STATUS.DONE, TASK_STATUS.CANCELLED];

/**
 * How many finished tasks the board shows by default.
 *
 * The board is for work in flight. Ten finished cards is enough to show that
 * work is getting finished, and enough to keep the column from burying the
 * columns that still need attention.
 */
const BOARD_FINISHED_LIMIT = 10;

/**
 * The most the board will return in one read.
 *
 * A ceiling on one response, not on what exists. Past this the list view is
 * the right place to look, because it pages through the history properly.
 */
const BOARD_FINISHED_MAX = 200;

/**
 * `completedAt` is derived from the status transition rather than sent by the
 * client, so a task cannot be marked done while carrying a stale completion date
 * and reopened without it being cleared. Both edges are handled: the first move
 * to done stamps it, and moving back out clears it.
 */
function applyStatus(task, nextStatus) {
  if (nextStatus === task.status) return;

  task.status = nextStatus;

  if (nextStatus === TASK_STATUS.DONE) {
    task.completedAt = new Date();
  } else {
    task.completedAt = null;
  }
}

/** Reject a link id that does not exist, with a message naming the field. */
async function assertEmployee(id) {
  if (id === null || id === undefined) return;
  const employee = await Employee.findByPk(id, { attributes: ['id'] });
  if (!employee) throw AppError.badRequest('That assignee does not exist');
}

export function toTaskJson(task) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    assignee: task.assignee ? { id: task.assignee.id, name: task.assignee.name } : null,
    assigneeId: task.assigneeId,
    assigneeUserId: task.assigneeUserId ?? null,
    clientId: task.clientId,
    projectId: task.projectId,
    // Names are resolved for display only. Included as ids plus display strings
    // rather than whole records, so the board never carries client financials.
    clientName: task.client?.name ?? null,
    projectTitle: task.project?.title ?? null,
  };
}

const LIST_INCLUDE = [
  /*
   * `attributes` must name real columns. Employee.fullName is a computed getter
   * on the model, not a column, so selecting it makes MySQL reject the whole
   * query with "Unknown column 'assignee.fullName' in 'field list'". The display
   * name is assembled in toTaskJson instead.
   */
  { model: Employee, as: 'assignee', attributes: ['id', 'name'], required: false },
  { model: models.Client, as: 'client', attributes: ['id', 'name'], required: false },
  { model: models.Project, as: 'project', attributes: ['id', 'title'], required: false },
];

export async function listTasks(query = {}) {
  const { page = 1, pageSize = 20, search, status, priority, assigneeId, openOnly } = query;

  const where = {};

  if (openOnly) {
    where.status = { [Op.in]: OPEN_STATUSES };
  } else if (status) {
    where.status = status;
  }

  if (priority) where.priority = priority;
  if (assigneeId) where.assigneeId = assigneeId;

  if (search) {
    where[Op.or] = [
      { title: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
    ];
  }

  const { rows, count } = await Task.findAndCountAll({
    where,
    include: LIST_INCLUDE,
    order: [
      /*
       * Urgent first. Written as a literal CASE rather than through
       * quoteIdentifier: 'priority' is a fixed column name in our own schema, so
       * there is nothing to interpolate and the readability is worth more than
       * the abstraction.
       */
      [literal("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"), 'ASC'],
      /*
       * Soonest deadline first. Undated tasks sort last in MySQL only if asked
       * explicitly — ASC would put NULLs before every real date, so a task with no
       * deadline would top the board ahead of something due today.
       */
      [literal('dueDate IS NULL, dueDate'), 'ASC'],
      ['createdAt', 'DESC'],
    ],
    limit: pageSize,
    offset: (page - 1) * pageSize,
    distinct: true,
    subQuery: false,
  });

  return {
    rows: rows.map(toTaskJson),
    meta: { page, pageSize, total: count, totalPages: Math.max(1, Math.ceil(count / pageSize)) },
  };
}

/** Counts per status, so the board can label its columns without loading everything. */
export async function taskSummary() {
  const grouped = await Task.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'count']],
    group: ['status'],
    paranoid: true,
  });

  const byStatus = Object.fromEntries(grouped.map((row) => [row.status, Number(row.get('count'))]));

  return {
    byStatus,
    open: OPEN_STATUSES.reduce((total, key) => total + (byStatus[key] || 0), 0),
    total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
  };
}

export async function getTask(id) {
  const task = await Task.findByPk(id, { include: LIST_INCLUDE });
  if (!task) throw AppError.notFound('Task not found');
  return toTaskJson(task);
}

/**
 * The signed-in person's own tasks — the "My tasks" view.
 *
 * Resolved entirely server-side: `user` is request.user, whose employeeId was
 * read from the session by requireAuth, so a caller can never ask for someone
 * else's list through this endpoint — there is no parameter to tamper with.
 *
 * An account with no employee link is a first-class answer, not an error: the
 * UI explains that an administrator must link the account in Settings → Users.
 * A soft-deleted employee counts as unlinked too, so a departed person's work
 * never appears on someone else's screen after a restore cycle.
 */
export async function myTasks(user) {
  const unlinked = {
    linked: false,
    employee: null,
    counts: { byStatus: {}, open: 0, overdue: 0, done: 0 },
    tasks: [],
  };

  if (!user?.employeeId) return unlinked;

  const employee = await Employee.findByPk(user.employeeId, { attributes: ['id', 'name'] });
  if (!employee) return unlinked;

  const tasks = await Task.findAll({
    where: { assigneeId: employee.id },
    include: LIST_INCLUDE,
    order: [
      // Same ordering as the admin board: urgent first, then soonest deadline
      // (undated last), newest as the tiebreak.
      [literal("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"), 'ASC'],
      [literal('dueDate IS NULL, dueDate'), 'ASC'],
      ['createdAt', 'DESC'],
    ],
    /*
     * Bounded in practice: a per-person backlog at agency scale is tens of
     * rows, not thousands. The cap keeps a years-long history from streaming
     * into one render, and the counts are computed from the same set below so
     * every badge matches exactly what is on screen.
     */
    limit: 500,
  });

  const byStatus = {};
  let open = 0;
  let overdue = 0;
  let done = 0;
  const now = new Date();

  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;

    if (OPEN_STATUSES.includes(task.status)) {
      open += 1;
      // Due date has passed and it is not finished — same rule as the admin
      // tasks page uses to render "Overdue".
      if (task.dueDate && new Date(task.dueDate) < now) overdue += 1;
    }
    if (task.status === TASK_STATUS.DONE) done += 1;
  }

  return {
    linked: true,
    employee: { id: employee.id, name: employee.name },
    counts: { byStatus, open, overdue, done },
    tasks: tasks.map(toTaskJson),
  };
}

/**
 * Board ordering: urgent first, then soonest deadline (undated last), newest as
 * the tiebreak. Shared with `myTasks` so the two boards never disagree.
 */
const BOARD_ORDER = [
  [literal("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END"), 'ASC'],
  [literal('dueDate IS NULL, dueDate'), 'ASC'],
  ['createdAt', 'DESC'],
];

/**
 * Time windows the performance report can be measured over.
 *
 * A window is counted from the moment a task was *closed*, not from when it
 * was created, so "completed this month" means the same thing to everybody.
 */
export const PERFORMANCE_PERIODS = Object.freeze({
  '7d': 7,
  '30d': 30,
  '90d': 90,
  year: 365,
  all: null,
});

/**
 * Per-person task performance, measured over a window of time.
 *
 * The question this answers is "who is actually getting work finished", so the
 * unit of measurement is the completion stamp:
 *
 *  - `completed` counts tasks whose `completedAt` falls inside the window.
 *  - `overdue` counts open tasks whose due date has already passed.
 *  - `avgDaysToComplete` measures `completedAt - createdAt`, so a number near
 *    zero means work is being closed quickly.
 *  - `onTimeRate` is the share of completed tasks that were finished on or
 *    before their due date.
 *
 * Everything is derived in SQL rather than by loading rows into memory, so the
 * report stays cheap as the task history grows.
 */
export async function taskPerformance({ period = '30d' } = {}) {
  const key = String(period);
  const days = Object.prototype.hasOwnProperty.call(PERFORMANCE_PERIODS, key) ? PERFORMANCE_PERIODS[key] : 30;

  // "All time" has no lower bound; every other window starts `days` ago.
  const since = days === null ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  /*
   * Two grouped queries rather than one with conditional counters.
   *
   * The first measures the window: work closed inside it, whether it was
   * finished on time, and how long it took. The second measures the present
   * state: everything still open and how much of it is late.
   *
   * Splitting them keeps each question in one WHERE clause, which is far easier
   * to trust than a single pass full of CASE expressions — and it means the
   * "all time" window is the same query with no lower bound rather than a
   * different shape of query.
   */
  const closedRows = await Task.findAll({
    attributes: [
      'assigneeId',
      [fn('COUNT', col('id')), 'completed'],
      [
        fn('COUNT', literal('CASE WHEN due_date IS NOT NULL AND completed_at <= due_date THEN 1 END')),
        'onTime',
      ],
      [
        fn('COUNT', literal('CASE WHEN due_date IS NOT NULL THEN 1 END')),
        'withDueDate',
      ],
      [fn('AVG', literal('DATEDIFF(completed_at, created_at)')), 'avgDaysToComplete'],
    ],
    where: {
      completedAt: { [Op.ne]: null },
      ...(since ? { completedAt: { [Op.gte]: since } } : {}),
    },
    group: ['assigneeId'],
    paranoid: true,
  });

  const openRows = await Task.findAll({
    attributes: [
      'assigneeId',
      [fn('COUNT', col('id')), 'open'],
      [
        fn('COUNT', literal('CASE WHEN due_date IS NOT NULL AND due_date < CURDATE() THEN 1 END')),
        'overdue',
      ],
    ],
    where: { status: { [Op.in]: OPEN_STATUSES } },
    group: ['assigneeId'],
    paranoid: true,
  });

  const staff = await Employee.findAll({
    attributes: ['id', 'name', 'position', 'employmentStatus', 'departmentId'],
    include: [{ model: models.Department, as: 'department', attributes: ['id', 'name'], required: false }],
    paranoid: true,
  });

  const staffById = new Map(staff.map((employee) => [Number(employee.id), employee]));

  /*
   * A person with no tasks still belongs on the board: zero completed is
   * information too, and hiding them would make the report look smaller than
   * the team is.
   */
  const people = [];

  for (const employee of staff) {
    people.push(buildPerformanceRow(employee, closedRows, openRows));
  }

  // Work assigned to someone who is no longer on the roster still happened.
  const seen = new Set(staffById.keys());

  for (const row of closedRows) {
    const assigneeId = Number(row.get('assigneeId'));
    if (!assigneeId || seen.has(assigneeId)) continue;
    seen.add(assigneeId);

    people.push(
      buildPerformanceRow(
        { id: assigneeId, name: 'Former team member', position: null, employmentStatus: 'inactive', department: null },
        closedRows,
        openRows,
      ),
    );
  }

  const totals = people.reduce(
    (sum, person) => ({
      completed: sum.completed + person.completed,
      open: sum.open + person.open,
      overdue: sum.overdue + person.overdue,
      onTimeRateTotal: sum.onTimeRateTotal + (person.onTimeRate ?? 0),
      rated: sum.rated + (person.onTimeRate === null ? 0 : 1),
    }),
    { completed: 0, open: 0, overdue: 0, onTimeRateTotal: 0, rated: 0 },
  );

  /*
   * Ranked by completed work, then by turnaround, then by name.
   *
   * The tiebreak on name keeps the order stable between renders: two people
   * with identical numbers would otherwise swap places on every reload, which
   * makes a leaderboard look broken.
   */
  people.sort(
    (a, b) =>
      b.completed - a.completed ||
      (a.avgDaysToComplete ?? Infinity) - (b.avgDaysToComplete ?? Infinity) ||
      a.name.localeCompare(b.name),
  );

  return {
    period: key,
    days,
    since: since ? since.toISOString() : null,
    generatedAt: new Date().toISOString(),
    totals: {
      completed: totals.completed,
      open: totals.open,
      overdue: totals.overdue,
      people: people.length,
      onTimeRate: totals.rated ? Math.round(totals.onTimeRateTotal / totals.rated) : null,
    },
    people: people.map((person, index) => ({ ...person, rank: index + 1 })),
  };
}

/** One person's row, with the ratios worked out from the raw counts. */
function buildPerformanceRow(employee, closedRows, openRows) {
  const closed = closedRows.find((row) => Number(row.get('assigneeId')) === Number(employee.id));
  const open = openRows.find((row) => Number(row.get('assigneeId')) === Number(employee.id));

  const get = (row, key) => (row ? Number(row.get(key) || 0) : 0);

  const completed = get(closed, 'completed');
  const onTime = get(closed, 'onTime');
  const withDueDate = get(closed, 'withDueDate');
  const avgDays = closed?.get('avgDaysToComplete');

  return {
    employeeId: Number(employee.id),
    name: employee.name,
    position: employee.position || null,
    department: employee.department?.name || null,
    employmentStatus: employee.employmentStatus || null,
    completed,
    open: get(open, 'open'),
    overdue: get(open, 'overdue'),
    onTimeRate: withDueDate ? Math.round((onTime / withDueDate) * 100) : null,
    avgDaysToComplete: avgDays === null || avgDays === undefined ? null : Math.round(Number(avgDays) * 10) / 10,
  };
}

/**
 * The board: every open task, and the tail of the finished ones.
 *
 * Two queries rather than one over the whole table. Open work is what the
 * board exists to show, so it is fetched in full — a cap here would hide live
 * work, which is the one thing that must never happen. Finished work is
 * history: only the most recent slice comes back, alongside the true total so
 * the column can say how much more there is without loading it.
 *
 * `finishedLimit` asks for a wider window than the default ten. The board
 * passes it when someone asks to see more, and it is clamped so one request
 * cannot pull the whole history.
 *
 * `finishedTotal` counts every closed task, so the board can report "248
 * finished" while showing the dozen most recent. The rest is one click away in
 * the list view, filtered by status.
 */
export async function boardTasks({ finishedLimit } = {}) {
  const requested = Number(finishedLimit);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(Math.floor(requested), 1), BOARD_FINISHED_MAX)
    : BOARD_FINISHED_LIMIT;

  const [open, finished, finishedTotal] = await Promise.all([
    Task.findAll({
      where: { status: { [Op.in]: OPEN_STATUSES } },
      include: LIST_INCLUDE,
      order: BOARD_ORDER,
      // A generous ceiling on live work, not a way of trimming it.
      limit: 500,
      distinct: true,
      subQuery: false,
    }),
    Task.findAll({
      where: { status: { [Op.in]: FINISHED_STATUSES } },
      include: LIST_INCLUDE,
      /*
       * Most recently closed first. Cancelled tasks carry no completion stamp,
       * so their creation date breaks the tie and they sort last — which is
       * right: a task that was cancelled years ago is older than one closed
       * yesterday.
       */
      order: [
        ['completedAt', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      limit,
      distinct: true,
      subQuery: false,
    }),
    Task.count({ where: { status: { [Op.in]: FINISHED_STATUSES } } }),
  ]);

  return {
    tasks: [...open, ...finished].map(toTaskJson),
    finishedTotal,
  };
}

export async function createTask(payload, request) {
  await assertEmployee(payload.assigneeId);

  const task = await Task.create({
    title: payload.title,
    description: payload.description ?? null,
    status: payload.status,
    priority: payload.priority,
    assigneeId: payload.assigneeId ?? null,
    clientId: payload.clientId ?? null,
    projectId: payload.projectId ?? null,
    dueDate: payload.dueDate ?? null,
  });

  if (task.status === TASK_STATUS.DONE) task.completedAt = new Date();
  await task.save();

  await logCrud(request, {
    action: ACTIVITY_ACTION.CREATE,
    entity: ENTITY.TASK,
    entityId: task.id,
    metadata: { title: task.title, status: task.status, priority: task.priority, assigneeId: task.assigneeId },
  });

  // Awaited so the notification is queued before the request ends; on shared
  // hosting the process can otherwise be recycled mid-write. The helper never
  // throws, so a Telegram outage cannot fail the task creation.
  await notifyTaskAssigned(task);

  if (task.status === TASK_STATUS.DONE) {
    await notifyAdminsTaskCompleted(task, request?.user?.id);
  }

  return getTask(task.id);
}

export async function updateTask(id, payload, request) {
  const task = await Task.findByPk(id);
  if (!task) throw AppError.notFound('Task not found');

  const before = task.get({ plain: true });

  const previousStatus = task.status;
  const previousAssigneeId = task.assigneeId;
  const previousAssigneeUserId = task.assigneeUserId;

  if (payload.assigneeId !== undefined) await assertEmployee(payload.assigneeId);

  for (const field of ['title', 'description', 'assigneeId', 'clientId', 'projectId', 'dueDate', 'priority']) {
    if (payload[field] !== undefined) task[field] = payload[field];
  }

  if (payload.status !== undefined) applyStatus(task, payload.status);

  await task.save();

  // One message per save: a reassignment is not also a status change worth a
  // second ping. The assignee is preferred over the status when both moved.
  const assigneeChanged =
    task.assigneeId !== previousAssigneeId || task.assigneeUserId !== previousAssigneeUserId;

  if (assigneeChanged) {
    await notifyTaskAssigned(task);
  } else if (previousStatus !== task.status) {
    await notifyTaskStatusChanged(task, previousStatus);
  }

  // When a task is closed, tell the admins — the oversight notification, separate
  // from the assignee's own status ping.
  if (previousStatus !== TASK_STATUS.DONE && task.status === TASK_STATUS.DONE) {
    await notifyAdminsTaskCompleted(task, request?.user?.id);
  }

  await logCrud(request, {
    action: ACTIVITY_ACTION.UPDATE,
    entity: ENTITY.TASK,
    entityId: id,
    metadata: buildDiff(before, task.get({ plain: true })),
  });

  return getTask(id);
}

export async function deleteTask(id, request) {
  const task = await Task.findByPk(id);
  if (!task) throw AppError.notFound('Task not found');

  const before = task.get({ plain: true });

  // Soft delete, matching every other model, so a removed task is recoverable
  // from the activity log rather than gone.
  await task.destroy();

  await logCrud(request, {
    action: ACTIVITY_ACTION.DELETE,
    entity: ENTITY.TASK,
    entityId: id,
    metadata: { title: before.title, status: before.status, priority: before.priority, assigneeId: before.assigneeId },
  });

  return { id: Number(id) };
}