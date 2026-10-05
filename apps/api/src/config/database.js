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
 * Create the database if it does not exist yet.
 *
 * The one thing the app cannot do by connecting to `DB_NAME` is create `DB_NAME`
 * itself — there is no database to connect to in order to create it. So this opens
 * a second connection with no database selected, creates an empty one, and lets
 * the normal connection take over.
 *
 * It is a no-op in the situation that actually matters: once cPanel has created
 * the database, this never runs, because the first `authenticate()` already
 * succeeded. It exists so that a developer who has never run this project does not
 * have to open a MySQL client first.
 *
 * On cPanel this will usually be *refused*, and that is fine and expected. A
 * cPanel database user is granted privileges on its own database only, not the
 * global CREATE privilege, so the attempt fails and is swallowed. The error the
 * operator sees is then the clear one from assertDatabaseConnection() below,
 * telling them to create the database in the panel — which they have to do anyway.
 */
async function createDatabaseIfMissing() {
  const admin = new Sequelize('', env.DB_USER, env.DB_PASSWORD, {
    host: env.DB_HOST,
    port: env.DB_PORT,
    dialect: env.DB_DIALECT,
    logging: false,
    retry: { max: 0 },
  });

  try {
    // Identifier cannot be a bound parameter in DDL, so it is interpolated. It is
    // not user input in any meaningful sense: it comes from the validated env
    // schema, which constrains it to a plain database name, and the value is
    // backtick-escaped.
    const name = `\`${env.DB_NAME.replace(/`/g, '``')}\``;

    await admin.query(
      `CREATE DATABASE IF NOT EXISTS ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );

    logger.warn({ database: env.DB_NAME }, 'database did not exist and has been created');
    return true;
  } catch (error) {
    // Almost always ER_DBACCESS_DENIED_ERROR on shared hosting. Not fatal here:
    // assertDatabaseConnection() reports the real problem with better wording.
    logger.debug({ reason: error.message }, 'could not create the database automatically');
    return false;
  } finally {
    await admin.close().catch(() => {});
  }
}

/**
 * Verify connectivity at boot, creating the database first if it is missing.
 *
 * On cPanel a misconfigured database user is the single most common deploy failure,
 * so this fails loudly and names the cause instead of starting a process that 500s
 * on every request.
 */
export async function assertDatabaseConnection() {
  try {
    await sequelize.authenticate();
  } catch (error) {
    // ER_BAD_DB_ERROR is "Unknown database". Anything else — a refused
    // connection, bad credentials, a wrong host — cannot be fixed by creating
    // the database, so only this one case is retried.
    const unknownDatabase = /Unknown database/i.test(error?.message || '');

    if (unknownDatabase) {
      logger.warn({ database: env.DB_NAME }, 'database not found; attempting to create it');
      await createDatabaseIfMissing();

      try {
        await sequelize.authenticate();
        logger.info({ database: env.DB_NAME, host: env.DB_HOST }, 'database connection established');
        return true;
      } catch {
        // Fall through to the shared error below.
      }
    }

    logger.error({ err: error.message, database: env.DB_NAME, host: env.DB_HOST }, 'database connection failed');
    throw new Error(
      `Could not connect to MySQL at ${env.DB_HOST}:${env.DB_PORT} as "${env.DB_USER}". ` +
        `Check the database exists, the user is granted ALL PRIVILEGES on it, and the password matches. ` +
        (unknownDatabase
          ? `On cPanel, create the database in the MySQL Databases panel — the app cannot create it ` +
            `itself, because the account has rights to that one database only.`
          : ''),
    );
  }

  logger.info({ database: env.DB_NAME, host: env.DB_HOST }, 'database connection established');
  return true;
}

/**
 * Development convenience: bring the schema in line with the models on boot.
 *
 * The brief forbids relying on `sync({ alter: true })` for *production* schema
 * management, and that restriction is kept absolutely: `syncSchema()` is a no-op
 * unless DB_SYNC_ALLOWED is true, and config/env.js terminates the process at
 * boot if DB_SYNC_ALLOWED is true while NODE_ENV=production. Production applies
 * schema changes through the migrations in config/bootstrap.js, which run on
 * startup.
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