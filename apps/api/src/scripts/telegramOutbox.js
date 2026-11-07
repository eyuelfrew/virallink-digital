import sequelize from '../config/database.js';
import logger from '../config/logger.js';
import { drainOutbox } from '../services/notifications.service.js';

/**
 * Deliver queued Telegram notifications.
 *
 * Runs from cPanel cron (there are no in-process timers on shared hosting; a
 * Passenger restart would lose one). Delivery is also attempted inline when a
 * message is queued, so this is the safety net for whatever a recycled process
 * left behind — retries live on the rows themselves.
 */

async function main() {
  const result = await drainOutbox(50);

  if (result.sent || result.failed) {
    logger.info(result, 'telegram outbox drained');
  }

  console.log(`Telegram outbox: ${result.sent} sent, ${result.failed} failed.`);

  await sequelize.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(`telegram:outbox failed: ${error.message}`);
  process.exit(1);
});
