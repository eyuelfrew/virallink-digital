import { Op, literal, fn, col } from 'sequelize';
import { models } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { TASK_STATUS } from '@virallink/shared/enums';

const { Task, Employee } = models;

/**
 * Task board.
 *
 * Internal only. Nothing here is reachable from the public API, and the task
 * title/description are never run through a public serializer.
 */

/** Statuses that count as "not finished". The board's default view. */
const OPEN_STATUSES = [TASK_STATUS.TODO, TASK_STATUS.IN_PROGRESS, TASK_STATUS.REVIEW, TASK_STATUS.BLOCKED];

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

export async function createTask(payload) {
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

  return getTask(task.id);
}

export async function updateTask(id, payload) {
  const task = await Task.findByPk(id);
  if (!task) throw AppError.notFound('Task not found');

  if (payload.assigneeId !== undefined) await assertEmployee(payload.assigneeId);

  for (const field of ['title', 'description', 'assigneeId', 'clientId', 'projectId', 'dueDate', 'priority']) {
    if (payload[field] !== undefined) task[field] = payload[field];
  }

  if (payload.status !== undefined) applyStatus(task, payload.status);

  await task.save();

  return getTask(id);
}

export async function deleteTask(id) {
  const task = await Task.findByPk(id);
  if (!task) throw AppError.notFound('Task not found');

  // Soft delete, matching every other model, so a removed task is recoverable
  // from the activity log rather than gone.
  await task.destroy();

  return { id: Number(id) };
}