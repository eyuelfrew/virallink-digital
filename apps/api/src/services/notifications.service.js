import { Op } from 'sequelize';
import { models } from '../models/index.js';
import logger from '../config/logger.js';
import { escapeHtml, isEnabled, sendMessage } from './telegram.service.js';

const { TelegramOutbox, User } = models;

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
  if (!isEnabled()) return null;

  try {
    const assignee = await resolveAssigneeUser(task);
    if (!assignee) return null;

    return await enqueue({
      userId: assignee.id,
      kind: 'task_assigned',
      text: `\u{1F4CB} New task assigned to you\n\n${taskSummary(task)}`,
    });
  } catch (error) {
    logger.warn({ err: error.message, taskId: task.id }, 'task assigned notification failed');
    return null;
  }
}

/** Tell the assignee a task moved to a new status. */
export async function notifyTaskStatusChanged(task, previousStatus) {
  if (!isEnabled()) return null;
  if (previousStatus === task.status) return null;

  try {
    const assignee = await resolveAssigneeUser(task);
    if (!assignee) return null;

    return await enqueue({
      userId: assignee.id,
      kind: 'task_status',
      text: `\u{1F504} Task updated: <b>${escapeHtml(task.title)}</b>\n${escapeHtml(previousStatus)} \u2192 <b>${escapeHtml(task.status)}</b>`,
    });
  } catch (error) {
    logger.warn({ err: error.message, taskId: task.id }, 'task status notification failed');
    return null;
  }
}
