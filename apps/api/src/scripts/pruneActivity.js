import { Op } from 'sequelize';
import env from '../config/env.js';
import sequelize from '../config/database.js';
import models from '../models/index.js';
import { pruneExpiredTokens } from '../services/auth.service.js';
import { pruneRevokedTokens } from '../utils/cache.js';
import logger from '../config/logger.js';

/**
 * Nightly maintenance.
 *
 * Runs from a cPanel cron job rather than an in-process timer, because Passenger
 * restarts apps unpredictably on shared hosting and any timer would be lost.
 *
 * Prunes:
 *  - refresh_tokens whose expiry has passed
 *  - activity_logs older than ACTIVITY_RETENTION_DAYS
 *  - the in-memory token blocklist (only meaningful within one process, so it is
 *    cleared defensively)
 */

const { ActivityLog, ContactInquiry } = models;

async function pruneActivityLogs() {
  const cutoff = new Date(Date.now() - env.ACTIVITY_RETENTION_DAYS * 86400000);
  // The audit trail is not soft-deleted, so pruning is a hard delete of rows that
  // are outside the retention window.
  return ActivityLog.destroy({ where: { createdAt: { [Op.lt]: cutoff } } });
}

async function pruneSoftDeleted() {
  // Hard-delete soft-deleted rows older than a year. Keeps tables small on the
  // small shared plans, while preserving recent history for anything that needs
  // it.
  const cutoff = new Date(Date.now() - 365 * 86400000);

  const results = await Promise.all(
    [
      models.Employee,
      models.Client,
      models.Project,
      models.Service,
      models.BlogPost,
      models.Shareholder,
      models.FinancialTransaction,
      models.Invoice,
      models.Payment,
      models.ContactInquiry,
    ].map((Model) =>
      Model.destroy({ where: { deletedAt: { [Op.lt]: cutoff } }, force: true }).catch((error) => {
        logger.warn({ model: Model.name, err: error.message }, 'prune skipped');
        return 0;
      }),
    ),
  );

  return results.reduce((sum, count) => sum + count, 0);
}

async function main() {
  logger.info({ retentionDays: env.ACTIVITY_RETENTION_DAYS }, 'maintenance starting');

  const tokens = await pruneExpiredTokens().catch((error) => {
    logger.error({ err: error.message }, 'failed to prune refresh tokens');
    return 0;
  });

  pruneRevokedTokens();

  const activity = await pruneActivityLogs().catch((error) => {
    logger.error({ err: error.message }, 'failed to prune activity logs');
    return 0;
  });

  const archived = await pruneSoftDeleted().catch((error) => {
    logger.error({ err: error.message }, 'failed to prune archived records');
    return 0;
  });

  logger.info({ tokens, activity, archived }, 'maintenance complete');
  console.log(`Pruned ${tokens} expired session(s), ${activity} activity log row(s), ${archived} archived record(s).`);

  await sequelize.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(`Maintenance failed: ${error.message}`);
  process.exit(1);
});