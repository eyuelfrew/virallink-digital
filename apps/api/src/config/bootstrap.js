import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import env from './env.js';
import logger from './logger.js';
import sequelize from './database.js';

/**
 * First-run bootstrap: bring the schema up to date, then seed reference data.
 *
 * This exists because of a deployment constraint, not a preference. The app is
 * hosted on cPanel, where the only thing that can be started is the Node.js
 * application itself — there is no shell, no cron and no "Run NPM Script" button
 * available on every host. So schema changes and seeding cannot be a manual step
 * someone remembers to run; they have to happen when the app boots.
 *
 * Both steps are idempotent, which is what makes that safe to do on every boot:
 *
 *   - a migration runs exactly once, then its filename is recorded in the
 *     SequelizeMeta table that sequelize-cli also reads and writes;
 *   - the seeder upserts, so re-running updates rows rather than duplicating them.
 *
 * `npm run migrate` and `npm run seed` remain available and reach the same end
 * state. They are a convenience for a developer, not a deployment step.
 *
 * Nothing here is destructive: no migration drops a populated table, and the
 * seeder contains no sample business data — no clients, employees, testimonials
 * or statistics. Everything public is entered by an administrator.
 *
 * On concurrency: Passenger starts several processes for one application, and
 * they will all execute this file at once on a deploy. Two processes running the
 * same migration simultaneously is how a schema gets corrupted, so the migration
 * step is serialised with a MySQL advisory lock. The second process waits, then
 * finds nothing pending. On shared hosting this is the difference between a
 * routine restart and an outage.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const MIGRATIONS_DIR = path.resolve(here, '../migrations');
const SEEDERS_DIR = path.resolve(here, '../seeders');

const META_TABLE = 'SequelizeMeta';

/** Advisory lock name is global per MySQL server, so it is suffixed per database. */
function lockName() {
  return `virallink_schema_migrate_${env.DB_NAME}`.slice(0, 64);
}

/**
 * Hold a MySQL advisory lock while `fn` runs, so concurrent Passenger processes
 * cannot migrate at the same time.
 *
 * The 30 second timeout is a backstop: if a process dies while holding the lock
 * MySQL releases it automatically, so a crash cannot wedge the deploy
 * permanently, but a genuinely slow migration on a small shared database should not
 * be cut off mid-statement.
 */
async function withMigrationLock(fn) {
  const name = lockName();
  const [rows] = await sequelize.query('SELECT GET_LOCK(?, ?) AS acquired', {
    replacements: [name, 30],
  });

  if (Number(rows[0].acquired) !== 1) {
    // Another process is migrating. It will apply what is pending, so there is
    // nothing useful to do here — continue to seeding, which is upserts anyway.
    logger.warn({ lock: name }, 'another process is migrating; skipping the migration step');
    return { applied: [], deferred: true };
  }

  try {
    return await fn();
  } finally {
    await sequelize.query('SELECT RELEASE_LOCK(?)', { replacements: [name] });
  }
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
 * order — the same ordering sequelize-cli relies on, which keeps the two paths
 * from disagreeing about what "pending" means.
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
 * Deliberately not wrapped in a transaction: MySQL commits implicitly on DDL, so a
 * transaction would imply an atomicity that does not exist. This matches
 * sequelize-cli, which also runs each migration on its own.
 *
 * That is also why the migration helpers tolerate an already-present column —
 * see migration-helpers/index.cjs. Without that, a migration failing partway
 * leaves its earlier statements behind, no SequelizeMeta row is written, and the
 * next boot dies on "Duplicate column" with no way forward short of a shell.
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
 * their grants, the financial categories and the company profile. It contains no
 * business data and is safe on every boot.
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
 * Boot-time entry point, called from server.js once the connection is verified.
 *
 * A failure here is logged with its real cause and rethrown, so a broken schema
 * stops the process instead of letting the API start serving 500s from missing
 * tables. On cPanel that surfaces as the app refusing to start, which is the
 * correct and visible outcome — the alternative is a site that looks up but fails
 * on every page, with nothing in the log to say why.
 */
export async function bootstrapDatabase() {
  const summary = { migrated: [], seeded: [] };

  if (env.AUTO_MIGRATE) {
    logger.info('AUTO_MIGRATE is on — applying pending migrations');
    const result = await withMigrationLock(() => applyPendingMigrations());
    summary.migrated = result.applied || [];
  } else {
    logger.warn('AUTO_MIGRATE is off — the schema will not be updated on boot');
  }

  if (env.AUTO_SEED) {
    // Seeding reads from tables the migrations just created, so it has to happen
    // after them even when the migration step was skipped or deferred.
    logger.info('AUTO_SEED is on — seeding reference data');
    summary.seeded = await runSeeders();
  } else {
    logger.warn('AUTO_SEED is off — reference data will not be seeded on boot');
  }

  return summary;
}

export default bootstrapDatabase;