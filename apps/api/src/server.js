import env from './config/env.js';
import logger from './config/logger.js';
import sequelize, { assertDatabaseConnection, syncSchema } from './config/database.js';
import { bootstrapDatabase } from './config/bootstrap.js';
import { createApp } from './app.js';
import { pruneExpiredTokens } from './services/auth.service.js';
import { pruneRevokedTokens } from './utils/cache.js';
import {
  disconnectAllTelegramAccounts,
  startAllTelegramAccounts,
} from './services/telegram-account.service.js';
import { getWebhookInfo, isEnabled, setMyCommands, setWebhook } from './services/telegram.service.js';
import './models/index.js';
import { attachChatWebSocket } from './services/chat.ws.service.js';

/**
 * Check that the Telegram webhook is registered and reachable, and register it
 * if it is not.
 *
 * This is the failure that hides best. A bot whose webhook points at a URL
 * Telegram cannot reach does not crash and does not log anything of its own —
 * it simply never hears anything. The visible consequence is that nobody can
 * link Telegram and nobody can recover a forgotten password, and the symptom
 * looks like "the feature is broken" rather than "the webhook is down".
 *
 * Telegram records its last delivery failure, so the check is a single call
 * and reads the answer off that.
 *
 * When the webhook is wrong it is also *fixed*, rather than only reported.
 * `TELEGRAM_WEBHOOK_URL` is the operator's statement of where this
 * deployment lives, and a registered webhook that points somewhere else is
 * stale by definition — usually the remains of a tunnel that has since
 * stopped, or a URL from the last environment this server was pointed at.
 * Re-registering removes the single most common way this breaks on deploy,
 * which is forgetting to run the registration script after moving.
 *
 * A warning, not an error: the rest of the API works without Telegram, and a
 * deployment that has switched the bot off should not have its boot treated as
 * a failure.
 */
async function checkTelegramWebhook() {
  if (!isEnabled()) return;

  const info = await getWebhookInfo();

  const expected = env.TELEGRAM_WEBHOOK_URL;
  const registered = info.url || '';
  const stale = expected && !registered.startsWith(expected);

  if (stale || !registered) {
    if (!expected) {
      logger.warn(
        registered
          ? {
              webhookUrl: registered,
              lastError: info.last_error_message,
            }
          : {},
        'Telegram has no webhook registered and TELEGRAM_WEBHOOK_URL is not set, so the ' +
          'bot cannot receive updates. Telegram linking and password recovery will not ' +
          'work. Set TELEGRAM_WEBHOOK_URL and run "npm run telegram:webhook -- set".',
      );
      return;
    }

    await registerTelegramWebhook(expected);

    logger.info(
      { webhookUrl: expected, previous: registered || null },
      'Registered the Telegram webhook — the registered URL did not match ' +
        'TELEGRAM_WEBHOOK_URL',
    );
    return;
  }

  if (info.last_error_message) {
    logger.warn(
      {
        webhookUrl: info.url,
        lastError: info.last_error_message,
        lastErrorAt: info.last_error_date
          ? new Date(info.last_error_date * 1000).toISOString()
          : null,
      },
      'Telegram cannot reach the registered webhook — the bot will not receive ' +
        'updates, so Telegram linking and password recovery will not work. Check ' +
        'that the URL is publicly reachable and re-register it with ' +
        '"npm run telegram:webhook -- set <public-url>".',
    );
  }
}

/**
 * Point Telegram's webhook at this deployment.
 *
 * The secret is in the path *and* sent as Telegram's `secret_token`, and the
 * route requires both — so knowing the URL is not enough to drive the bot.
 */
async function registerTelegramWebhook(baseUrl) {
  if (!env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn(
      'Cannot register the Telegram webhook: TELEGRAM_WEBHOOK_SECRET is not set. ' +
        'It is required — the route checks the secret in the path and in the header ' +
        'Telegram sends back.',
    );
    return;
  }

  const base = baseUrl.replace(/\/+$/, '');
  const url = `${base}/api/v1/telegram/webhook/${encodeURIComponent(env.TELEGRAM_WEBHOOK_SECRET)}`;

  await setWebhook(url, env.TELEGRAM_WEBHOOK_SECRET);
  await setMyCommands([
    { command: 'start', description: 'Start the chat' },
    { command: 'menu', description: 'Open the interactive menu' },
    { command: 'help', description: 'How this bot works' },
  ]).catch(() => {});
}

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
  /*
   * CORS diagnostic. Always logged at startup so a misconfigured allowlist is
   * visible in the same place as "API listening" — on local dev and in the
   * cPanel app log. Placed before the database check so it still prints when
   * the DB is unreachable: CORS is configuration, not connectivity.
   */
  logger.info(
    {
      siteUrl: env.SITE_URL,
      corsOrigins: env.CORS_ORIGINS,
      envFile: process.env.ENV_FILE_LOADED_FROM,
      cwd: process.cwd(),
    },
    'CORS configuration',
  );

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

  // Realtime chat: upgrades attach to this same socket, so chat is live
  // alongside the REST API rather than as a second process.
  attachChatWebSocket(server);

  // Slow clients on shared hosting should not hold a connection open forever.
  server.headersTimeout = 65000;
  server.requestTimeout = 60000;
  server.keepAliveTimeout = 61000;

  // Restore personal Telegram sessions saved by signed-in users. This runs after
  // the listener opens so a slow Telegram connection never delays HTTP startup;
  // failures are logged per account and do not stop the API.
  startAllTelegramAccounts().catch((error) =>
    logger.error({ err: error.message }, 'could not restore personal telegram sessions'),
  );

  /*
   * Check that the Telegram webhook is actually reachable.
   *
   * This is the failure that hides best. A bot whose webhook points at a
   * tunnel that is no longer up does not crash and does not log anything of
   * its own — it simply never hears anything. The visible consequence is
   * that nobody can link Telegram and nobody can recover a forgotten password,
   * and the symptom looks like "the feature is broken" rather than "the
   * webhook is down".
   *
   * Telegram records its last delivery failure, so the check is a single call
   * and reads the answer off that.
   */
  checkTelegramWebhook().catch((error) =>
    logger.warn({ err: error.message }, 'could not check the telegram webhook'),
  );

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
      await disconnectAllTelegramAccounts();
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