import sequelize from '../config/database.js';
import logger from '../config/logger.js';
import { drainPushOutbox } from '../services/push.service.js';

/**
 * Deliver queued push notifications.
 *
 * Same shape as the Telegram outbox drain: runs from cPanel cron, retries live
 * on the rows, and is the safety net for whatever a recycled Passenger process
 * left behind.
 */
async function main() {
  const result = await drainPushOutbox(50);

  if (result.sent || result.failed) {
    logger.info(result, 'push outbox drained');
  }

  console.log(`Push outbox: ${result.sent} sent, ${result.failed} failed.`);

  await sequelize.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(`push:outbox failed: ${error.message}`);
  process.exit(1);
});
