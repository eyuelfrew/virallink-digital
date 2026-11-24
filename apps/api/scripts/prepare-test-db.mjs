/**
 * Create and prepare the isolated database the integration suites use.
 *
 * Steps, in order:
 *
 *   1. create the database if it does not exist (the app cannot create the
 *      database it connects to — there is no server to connect to yet);
 *   2. apply any pending migrations;
 *   3. seed the RBAC baseline (permissions, roles, grants) the suites assert
 *      against.
 *
 * Both the migration and the seed steps are the same code the API runs on boot,
 * so the test database always matches the schema the application expects.
 *
 * Run with:  npm run db:test:prepare --workspace @virallink/api
 */
import mysql from 'mysql2/promise';

import {
  assertIsolated,
  loadRootEnv,
  readEnvValue,
  testDatabaseName,
} from './test-db.js';

loadRootEnv();

const database = testDatabaseName();

/*
 * The development database is the one named in .env. The suites must never
 * write to it, so that is checked before anything connects.
 */
assertIsolated(database, readEnvValue('DB_NAME'));

/*
 * The app's env module snapshots process.env when it is imported, so the
 * database name has to be in place before anything under src/ is loaded.
 */
process.env.DB_NAME = database;

const { default: env } = await import('../src/config/env.js');
const { default: sequelize } = await import('../src/config/database.js');
const { applyPendingMigrations, runSeeders } = await import(
  '../src/config/bootstrap.js'
);

console.log(`Preparing test database "${database}" ...`);

const admin = await mysql.createConnection({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
});

await admin.query(
  `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
);
await admin.end();

await sequelize.authenticate();

const migrations = await applyPendingMigrations();
await runSeeders();

console.log(
  `Test database "${database}" ready ` +
    `(${migrations.applied.length} migration(s) applied, RBAC baseline seeded).`,
);

await sequelize.close();
