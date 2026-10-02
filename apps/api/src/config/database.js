import { Sequelize } from 'sequelize';
import env from './env.js';
import logger from './logger.js';

/**
 * Single Sequelize instance.
 *
 * Notes for shared hosting (cPanel):
 * - Pool size is deliberately small. Hosts cap concurrent connections per DB
 *   user and enforce a memory ceiling per process; a large pool causes the app
 *   to be killed rather than slow down.
 * - `dialectOptions` sets a connect timeout so a stalled connection surfaces as
 *   an error instead of hanging a request until the proxy gives up.
 */
export const sequelize = new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: env.DB_DIALECT,
  // Sequelize passes this value straight to MySQL as a named time zone. An empty
  // or undefined value is rejected by the server as "Unknown or incorrect time
  // zone", so it is only ever set to an explicit offset or omitted entirely.
  ...(env.isProduction ? { timezone: '+00:00' } : {}),

  define: {
    underscored: true,
    freezeTableName: false,
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci',
  },

  pool: {
    max: env.DB_POOL_MAX,
    min: env.DB_POOL_MIN,
    acquire: env.DB_POOL_ACQUIRE_MS,
    idle: env.DB_POOL_IDLE_MS,
  },

  retry: { max: 2 },

  logging: env.DB_LOG_QUERIES
    ? (sql, timing) => logger.debug({ sql, timing }, 'query')
    : false,

  dialectOptions: {
    connectTimeout: 10000,
    // MySQL 8 default auth plugin is caching_sha2_password, which mysql2
    // supports. supportBigNumbers keeps BIGINT ids exact as strings when they
    // exceed JS safe-integer range (they will not in practice, but cheap to set).
    supportBigNumbers: true,
    bigNumberStrings: false,
    dateStrings: false,
  },
});

/**
 * Verify connectivity at boot. On cPanel a misconfigured database user is the
 * single most common deploy failure, so fail loudly and name the cause instead
 * of starting a process that 500s on every request.
 */
export async function assertDatabaseConnection() {
  try {
    await sequelize.authenticate();
    logger.info({ database: env.DB_NAME, host: env.DB_HOST }, 'database connection established');
    return true;
  } catch (error) {
    logger.error({ err: error.message, database: env.DB_NAME, host: env.DB_HOST }, 'database connection failed');
    throw new Error(
      `Could not connect to MySQL at ${env.DB_HOST}:${env.DB_PORT} as "${env.DB_USER}". ` +
        `Check the database exists, the user is granted ALL PRIVILEGES on it, and the password matches.`,
    );
  }
}

/**
 * Development convenience: bring the schema in line with the models on boot.
 *
 * The brief forbids relying on `sync({ alter: true })` for *production* schema
 * management, and that restriction is kept absolutely: `syncSchema()` is a no-op
 * unless DB_SYNC_ALLOWED is true, and config/env.js terminates the process at
 * boot if DB_SYNC_ALLOWED is true while NODE_ENV=production. Production applies
 * schema changes through `npm run migrate`.
 *
 * While iterating on models this saves running a migration for every field tweak.
 */
export async function syncSchema() {
  if (!env.DB_SYNC_ALLOWED) {
    logger.debug('DB_SYNC_ALLOWED is false; skipping schema sync');
    return false;
  }

  if (env.isProduction) {
    // Defence in depth. env.js already exits before we get here, but this
    // function must never be the thing that protects production data.
    throw new Error('Refusing to run sequelize.sync() with NODE_ENV=production. Use npm run migrate.');
  }

  logger.warn('DB_SYNC_ALLOWED is true — applying model changes to the database (development only)');

  // The models must be registered on this Sequelize instance before sync(), or it
  // has nothing to create. Imported lazily to avoid a circular import at module
  // load time: models/index.js imports this file.
  await import('../models/index.js');

  await sequelize.sync({ alter: true });
  logger.warn('schema sync complete');
  return true;
}

export default sequelize;