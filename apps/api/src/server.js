import env from './config/env.js';
import logger from './config/logger.js';
import sequelize, { assertDatabaseConnection, syncSchema } from './config/database.js';
import { bootstrapDatabase } from './config/bootstrap.js';
import { createApp } from './app.js';
import { pruneExpiredTokens } from './services/auth.service.js';
import { pruneRevokedTokens } from './utils/cache.js';
import './models/index.js';

/**
 * Server entry point.
 *
 * Boot order matters: configuration is validated (and the process exits with a
 * named error if it is wrong), then the database connection is verified, then
 * pending migrations are applied and reference data seeded, then the schema is
 * reconciled in development, and only then does the HTTP server start listening.
 *
 * Migrations run before the listener opens on purpose. A request that arrives
 * while the schema is half-updated gets a confusing error; a process that refuses
 * to listen until the schema is correct gets a clear one. On cPanel that shows up
 * as the app not starting, which is a far better failure than a site that loads
 * and 500s on every page.
 *
 * On cPanel, Passenger owns this process. `port` must match the port assigned to
 * the app in the Setup Node.js App panel; Passenger reads the listening port from
 * the server it starts.
 */

async function start() {
  // Fail fast on a bad database rather than starting a process that 500s on
  // every request.
  await assertDatabaseConnection();

  // Bring the schema up to date and seed the RBAC baseline. Idempotent, and
  // serialised across Passenger's several processes by an advisory lock. This is
  // what makes a cPanel deploy a single action: start the app, and the database
  // takes care of itself.
  await bootstrapDatabase();

  // Development convenience: keep tables in step with the models. No-op unless
  // DB_SYNC_ALLOWED is true, and impossible in production.
  await syncSchema();

  const app = createApp();

  const server = app.listen(env.PORT, env.API_HOST, () => {
    logger.info(
      {
        port: env.PORT,
        host: env.API_HOST,
        env: env.NODE_ENV,
        syncAllowed: env.DB_SYNC_ALLOWED,
      },
      'API listening',
    );
  });

  // Slow clients on shared hosting should not hold a connection open forever.
  server.headersTimeout = 65000;
  server.requestTimeout = 60000;
  server.keepAliveTimeout = 61000;

  /* ------------------------------------------------------------------ */
  /* Graceful shutdown                                                  */
  /* ------------------------------------------------------------------ */

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    // Stop accepting connections, then close the pool so in-flight requests can
    // finish. On Passenger, SIGTERM is how a restart is requested.
    const forceExit = setTimeout(() => {
      logger.error('forced exit after shutdown timeout');
      process.exit(1);
    }, 10000);
    forceExit.unref();

    try {
      await new Promise((resolve) => server.close(resolve));
      await sequelize.close();
      clearTimeout(forceExit);
      logger.info('shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error.message }, 'error during shutdown');
      process.exit(1);
    }
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  /* ------------------------------------------------------------------ */
  /* Housekeeping                                                      */
  /* ------------------------------------------------------------------ */

  /**
   * Periodic cleanup of expired sessions and the in-memory token blocklist.
   *
   * In-process only, which is sufficient for a single Node app. It runs on an
   * interval rather than relying solely on cron because a stale blocklist entry
   * is cheap but a growing table is not.
   */
  const housekeeping = setInterval(
    () => {
      pruneRevokedTokens();
      pruneExpiredTokens().catch((error) =>
        logger.error({ err: error.message }, 'failed to prune expired tokens'),
      );
    },
    60 * 60 * 1000,
  );

  housekeeping.unref();

  return server;
}

/**
 * Last-resort handlers. An unhandled rejection in Express 5 usually means a bug
 * in a middleware, so it is logged loudly rather than swallowed.
 */
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason instanceof Error ? reason.message : String(reason) }, 'unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error.message, stack: error.stack }, 'uncaught exception — shutting down');
  process.exit(1);
});

start().catch((error) => {
  logger.fatal({ err: error.message, stack: error.stack }, 'failed to start API');
  // eslint-disable-next-line no-console
  console.error(`\nFailed to start: ${error.message}\n`);
  process.exit(1);
});