import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import env from './env.js';
import logger from './logger.js';
import sequelize from './database.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const MIGRATIONS_DIR = path.resolve(here, '../migrations');
const SEEDERS_DIR = path.resolve(here, '../seeders');

/**
 * First-run bootstrap: bring the schema up to date, then seed reference data.
 *
 * Both steps run from server.js during boot so a fresh clone needs no manual
 * command before the first request. Both are idempotent:
 *
 *   - a migration runs exactly once, then its filename is recorded in the
 *     SequelizeMeta table that sequelize-cli also reads and writes;
 *   - the seeder upserts, so re-running updates rows rather than duplicating
 *     them.
 *
 * That means `npm run migrate` and `npm run seed` remain available and produce
 * the same end state as booting the server. Nothing here is destructive: no
 * migration drops a populated table, and the seeder contains no sample company
 * data (no clients, employees, testimonials or statistics).
 *
 * Production sets AUTO_MIGRATE=false and config/env.js refuses to boot if it is
 * true there. Passenger can start several processes concurrently, and two
 * processes running the same migration at once is not safe; a MySQL advisory
 * lock serialises the attempt, but the supported production path is still
 * 'Run NPM script' -> npm run migrate, where one process runs at a time.
 */

const META_TABLE = 'SequelizeMeta';
const MIGRATION_LOCK = 'virallink_schema_migrate';

/** Advisory lock name is global per MySQL server, so it is prefixed per database. */
function lockName() {
  return `${MIGRATION_LOCK}_${env.DB_NAME}`.slice(0, 64);
}

async function ensureMetaTable() {
  const queryInterface = sequelize.getQueryInterface();
  const [rows] = await sequelize.query(
    `SELECT COUNT(*) AS found FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    { replacements: [META_TABLE] },
  );

  if (Number(rows[0].found) > 0) return;

  await queryInterface.createTable(
    META_TABLE,
    { name: { type: sequelize.Sequelize.DataTypes.STRING, primaryKey: true, allowNull: false } },
    { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  );
}

async function appliedNames() {
  await ensureMetaTable();
  const [rows] = await sequelize.query(`SELECT name FROM \`${META_TABLE}\``);
  return new Set(rows.map((row) => row.name));
}

/**
 * Migration filenames are timestamp-prefixed, so lexical sort is chronological
 * order. That ordering is what sequelize-cli relies on and is preserved here so
 * the two paths cannot disagree about what "pending" means.
 */
function migrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.cjs'))
    .sort();
}

/**
 * Run any migration that has not been recorded yet.
 *
 * Deliberately not wrapped in a transaction: MySQL commits implicitly on DDL,
 * so a transaction would imply an atomicity that does not exist. This matches
 * sequelize-cli, which also runs each migration on its own.
 */
export async function applyPendingMigrations() {
  const already = await appliedNames();
  const files = migrationFiles();
  const pending = files.filter((name) => !already.has(name));

  if (!pending.length) {
    logger.debug({ count: files.length }, 'schema already up to date');
    return { applied: [], total: files.length };
  }

  const queryInterface = sequelize.getQueryInterface();
  const applied = [];

  for (const name of pending) {
    const started = process.hrtime.bigint();
    const migration = require(path.join(MIGRATIONS_DIR, name));

    if (typeof migration.up !== 'function') {
      throw new Error(`Migration ${name} does not export an up() function.`);
    }

    await migration.up(queryInterface, sequelize.Sequelize);
    await queryInterface.bulkInsert(META_TABLE, [{ name }]);

    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    applied.push(name);
    logger.info({ migration: name, ms: Math.round(ms) }, 'migration applied');
  }

  logger.info({ applied: applied.length, total: files.length }, 'schema up to date');
  return { applied, total: files.length };
}

/**
 * Run every seeder in `src/seeders`.
 *
 * The seeder is the RBAC baseline only — permissions, the four system roles,
 * their grants, and the financial categories. It is safe on every boot.
 */
export async function runSeeders() {
  const queryInterface = sequelize.getQueryInterface();
  const files = fs
    .readdirSync(SEEDERS_DIR)
    .filter((name) => name.endsWith('.cjs'))
    .sort();

  const ran = [];

  for (const name of files) {
    const seeder = require(path.join(SEEDERS_DIR, name));

    if (typeof seeder.up !== 'function') {
      throw new Error(`Seeder ${name} does not export an up() function.`);
    }

    await seeder.up(queryInterface, sequelize.Sequelize);
    ran.push(name);
    logger.info({ seeder: name }, 'seeder applied');
  }

  return ran;
}

/**
 * Hold a MySQL advisory lock so that, if several processes do boot at once, only
 * one migrates and the rest wait and then find nothing pending. Thirty seconds
 * is long enough for the slowest migration and short enough that a crashed
 * holder does not block boot indefinitely.
 */
async function withMigrationLock(fn) {
  const name = lockName();
  const [rows] = await sequelize.query('SELECT GET_LOCK(?, ?) AS acquired', {
    replacements: [name, 30],
  });

  if (Number(rows[0].acquired) !== 1) {
    logger.warn({ lock: name }, 'could not acquire the migration lock; another process is migrating');
    return { applied: [], deferred: true };
  }

  try {
    return await fn();
  } finally {
    await sequelize.query('SELECT RELEASE_LOCK(?)', { replacements: [name] });
  }
}

/**
 * Boot-time entry point, called from server.js after the connection is verified.
 *
 * Failures are logged with the real cause and rethrown, so a broken schema stops
 * the process instead of letting the API serve 500s from missing tables.
 */
export async function bootstrapDatabase() {
  const summary = { migrated: [], seeded: [] };

  if (env.AUTO_MIGRATE) {
    logger.info('AUTO_MIGRATE is true — applying pending migrations');
    const result = await withMigrationLock(() => applyPendingMigrations());
    summary.migrated = result.applied || [];
  } else {
    logger.debug('AUTO_MIGRATE is false — skipping migrations');
  }

  if (env.AUTO_SEED) {
    // Seeding reads from tables the migrations just created, so it has to happen
    // after them even though the lock above has already been released.
    logger.info('AUTO_SEED is true — seeding reference data');
    summary.seeded = await runSeeders();
  } else {
    logger.debug('AUTO_SEED is false — skipping seeders');
  }

  return summary;
}

export default bootstrapDatabase;