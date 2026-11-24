import { Op } from 'sequelize';
import { models } from '../models/index.js';
import logger from '../config/logger.js';
import { escapeHtml, isEnabled, sendMessage } from './telegram.service.js';
import { ROLES } from '../shared/enums.js';
import { enqueuePush, isEnabled as isPushEnabled } from './push.service.js';

const { TelegramOutbox, User, Role } = models;

/**
 * Notifications out of the outbox.
 *
 * Producing a notification and delivering it are deliberately separate steps.
 * The producer (assigning a task) only writes a row; delivery happens here and
 * can be retried. On shared hosting the process can be recycled between the two
 * — and a notification that silently disappears is worse than one that arrives
 * a minute late — so enqueue always succeeds even when Telegram is unreachable,
 * and a cron drain picks up whatever is left.
 *
 * Nothing in this module throws to its caller: notifications are a side effect
 * of an action that has already succeeded, and must never fail that action.
 */

/** Give up after this many tries so a permanently-bad chat does not loop forever. */
const MAX_ATTEMPTS = 5;

/**
 * Queue a message. `userId` and `chatId` are alternatives: pass `chatId` for a
 * fixed target (announcements) or `userId` to reach whoever is linked to them.
 */
export async function enqueue({ userId = null, chatId = null, kind, text, parseMode = 'HTML', buttons = null }) {
  if (!isEnabled()) return null;
  if (!userId && !chatId) return null;

  let row;
  try {
    row = await TelegramOutbox.create({
      userId,
      chatId,
      kind,
      payload: { text, parseMode, buttons },
    });
  } catch (error) {
    logger.warn({ err: error.message, kind }, 'failed to enqueue telegram notification');
    return null;
  }

  // Best-effort immediate delivery; the cron drain is the safety net.
  drainOutbox().catch((error) => logger.warn({ err: error.message }, 'telegram drain failed'));

  return row;
}

/**
 * Deliver pending messages, oldest first. Safe to call from a request or from
 * cron; a row is only marked `sent` once Telegram accepts it.
 */
export async function drainOutbox(limit = 25) {
  if (!isEnabled()) return { sent: 0, failed: 0 };

  const rows = await TelegramOutbox.findAll({
    where: { status: 'pending', attempts: { [Op.lt]: MAX_ATTEMPTS } },
    order: [['createdAt', 'ASC']],
    limit,
  });

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const chatId = row.chatId ?? (await resolveChatId(row.userId));
      if (!chatId) {
        await row.update({ status: 'failed', lastError: 'No linked Telegram chat', attempts: row.attempts + 1 });
        failed += 1;
        continue;
      }

      const { text, parseMode, buttons } = row.payload || {};
      await sendMessage(chatId, text, { parseMode, buttons });
      await row.update({ status: 'sent', sentAt: new Date(), attempts: row.attempts + 1, lastError: null });
      sent += 1;
    } catch (error) {
      const attempts = row.attempts + 1;
      await row.update({
        attempts,
        lastError: String(error.message).slice(0, 250),
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
      });
      failed += 1;
    }
  }

  return { sent, failed };
}

/**
 * Who to message about a task.
 *
 * A task may be assigned to a User directly (`assigneeUserId`, which wins) or to
 * an Employee (`assigneeId`). The employee is not a login, so it is resolved to
 * the user account that carries that employee.
 */
async function resolveAssigneeUser(task) {
  if (task.assigneeUserId) {
    const direct = await User.findOne({
      where: { id: task.assigneeUserId, isActive: true },
      attributes: ['id'],
    });
    if (direct) return direct;
  }

  if (task.assigneeId) {
    const linked = await User.findOne({
      where: { employeeId: task.assigneeId, isActive: true },
      attributes: ['id'],
    });
    if (linked) return linked;
  }

  return null;
}

async function resolveChatId(userId) {
  if (!userId) return null;

  const user = await User.findByPk(userId, {
    attributes: ['telegramChatId', 'telegramAlertsEnabled', 'isActive'],
  });

  if (!user || !user.isActive || user.telegramAlertsEnabled === false) return null;
  return user.telegramChatId || null;
}

function taskSummary(task) {
  const lines = [`<b>${escapeHtml(task.title)}</b>`];
  if (task.priority) lines.push(`Priority: ${escapeHtml(task.priority)}`);
  if (task.dueDate) lines.push(`Due: ${escapeHtml(task.dueDate)}`);
  if (task.description) lines.push(escapeHtml(String(task.description).slice(0, 300)));
  return lines.join('\n');
}

/** Tell someone a task has landed on them. */
export async function notifyTaskAssigned(task) {
  let telegramResult = null;

  try {
    const assignee = await resolveAssigneeUser(task);
    if (!assignee) return null;

    if (isEnabled()) {
      telegramResult = await enqueue({
        userId: assignee.id,
        kind: 'task_assigned',
        text: `\u{1F4CB} New task assigned to you\n\n${taskSummary(task)}`,
      });
    }

    // Always stored in the inbox, even when FCM is not configured, so the
    // recipient can see it in-app. Push delivery is attempted when FCM is on.
    await enqueuePush({
      userId: assignee.id,
      kind: 'task_assigned',
      title: 'New task assigned',
      body: task.title,
      data: { taskId: task.id, type: 'task_assigned' },
    });
  } catch (error) {
    logger.warn({ err: error.message, taskId: task.id }, 'task assigned notification failed');
  }

  return telegramResult;
}

/**
 * Send a personal notification to a specific user.
 *
 * Used by the admin "send notification" feature. Delivers through every
 * channel the recipient has: push (FCM) and, when Telegram is linked, a
 * message. Best-effort, never throws.
 */
export async function sendUserNotification(userId, { title, body }) {
  const result = { push: { sent: 0, failed: 0 }, telegram: false, fcmEnabled: isPushEnabled() };

  if (!userId) return result;

  try {
    const user = await User.findByPk(userId, { attributes: ['id', 'isActive'] });
    if (!user || !user.isActive) return result;

    const pushTitle = title || 'Virallink';
    const pushBody = body || '';

    // Always store in the inbox so the recipient can see it in-app, regardless
    // of whether push delivery is configured.
    const inboxRow = await enqueuePush({
      userId: user.id,
      kind: 'admin_message',
      title: pushTitle,
      body: pushBody,
      data: { type: 'admin_message' },
    });

    if (isPushEnabled()) {
      const pushResult = await sendPush(user.id, {
        title: pushTitle,
        body: pushBody,
        data: { type: 'admin_message' },
      });
      result.push = pushResult;
    }

    if (isEnabled()) {
      await enqueue({
        userId: user.id,
        kind: 'admin_message',
        text: `<b>${escapeHtml(pushTitle)}</b>\n${escapeHtml(pushBody)}`,
      });
      result.telegram = true;
    }
  } catch (error) {
    logger.warn({ err: error.message, userId }, 'admin notification send failed');
  }

  return result;
}

/**
 * Notify every admin that a task was completed.
 *
 * The assignee already gets a status-change ping of their own, so this is the
 * oversight notification: "a task was closed." It goes to every active
 * SUPER_ADMIN and ADMIN, except the person who actually closed it, who already
 * knows.
 */
export async function notifyAdminsTaskCompleted(task, actorUserId = null) {
  try {
    const admins = await User.findAll({
      attributes: ['id'],
      where: { isActive: true },
      include: [
        {
          model: Role,
          as: 'roles',
          attributes: [],
          where: { key: { [Op.in]: [ROLES.SUPER_ADMIN, ROLES.ADMIN] } },
          required: true,
        },
      ],
      distinct: true,
    });

    for (const admin of admins) {
      if (actorUserId && Number(admin.id) === Number(actorUserId)) continue;

      await enqueuePush({
        userId: admin.id,
        kind: 'task_completed',
        title: 'Task completed',
        body: task.title,
        data: { taskId: task.id, type: 'task_completed' },
      });

      if (isEnabled()) {
        await enqueue({
          userId: admin.id,
          kind: 'task_completed',
          text: `\u{2705} Task completed: <b>${escapeHtml(task.title)}</b>`,
        });
      }
    }
  } catch (error) {
    logger.warn({ err: error.message, taskId: task.id }, 'admin task-completion notification failed');
  }
}

/** Tell the assignee a task moved to a new status. */
export async function notifyTaskStatusChanged(task, previousStatus) {
  if (previousStatus === task.status) return null;

  try {
    const assignee = await resolveAssigneeUser(task);
    if (!assignee) return null;

    if (isEnabled()) {
      await enqueue({
        userId: assignee.id,
        kind: 'task_status',
        text: `\u{1F504} Task updated: <b>${escapeHtml(task.title)}</b>\n${escapeHtml(previousStatus)} \u2192 <b>${escapeHtml(task.status)}</b>`,
      });
    }

    await enqueuePush({
      userId: assignee.id,
      kind: 'task_status',
      title: 'Task updated',
      body: `${task.title}: ${previousStatus} → ${task.status}`,
      data: { taskId: task.id, type: 'task_status' },
    });
  } catch (error) {
    logger.warn({ err: error.message, taskId: task.id }, 'task status notification failed');
    return null;
  }

  return null;
}
