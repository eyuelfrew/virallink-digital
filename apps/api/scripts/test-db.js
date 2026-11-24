/**
 * The database the integration suites are allowed to write to.
 *
 * The suites are HTTP-level tests: they create employees, clients, services,
 * projects and tasks to exercise the RBAC rules, and they do not remove
 * everything they make. Running them against the development database
 * therefore leaves their fixtures behind — the admin screens fill up with
 * "Search Person", "Editor Project" and "Paid Advertising" rows that nobody
 * typed, and the auth suite even resets the password of the real
 * `admin@virallink.test` account on every run.
 *
 * So the suites get their own database. This module owns its name and knows
 * how to load the same .env the application loads.
 *
 * Nothing in here runs against the development database: `testDatabaseName()`
 * always resolves to a separate schema.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

/** apps/api — the workspace root of the API. */
export const APP_ROOT = path.resolve(here, '..');

/** The monorepo root — kept for the optional single-file fallback .env. */
const REPO_ROOT = path.resolve(APP_ROOT, '../..');

/** apps/api — its own .env is authoritative for the API. */
const APP_ENV = path.join(APP_ROOT, '.env');

/**
 * Load the same .env the application loads.
 *
 * dotenv never overrides a variable that is already in the environment, so an
 * explicit `DB_NAME=... npm run test:integration` still wins over the file.
 */
export function loadRootEnv() {
  const file = fs.existsSync(APP_ENV) ? APP_ENV : path.join(REPO_ROOT, '.env');

  if (fs.existsSync(file)) {
    dotenv.config({ path: file, quiet: true });
    return file;
  }

  return null;
}

/**
 * The name of the database the suites run against.
 *
 * Defaults to `virallink_test`, which is created on demand. Override with
 * `TEST_DB_NAME` in .env if the host has a naming convention.
 */
export function testDatabaseName() {
  return process.env.TEST_DB_NAME || 'virallink_test';
}

/**
 * Read a single value straight out of the .env file.
 *
 * This is deliberately not `process.env`: the point is to know what the
 * *configuration file* says the development database is called, even when the
 * shell overrides DB_NAME for the run.
 */
export function readEnvValue(name) {
  const file = path.join(REPO_ROOT, '.env');

  if (!fs.existsSync(file)) return null;

  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1] !== name) continue;

    return match[2].replace(/^["']|["']$/g, '').trim();
  }

  return null;
}

/**
 * Guard against a configuration that would point the suites at the database the
 * app actually uses.
 *
 * Running the suites against the development database is exactly the problem
 * this module exists to solve, so it is refused loudly rather than quietly
 * filling the admin screens with fixtures.
 */
export function assertIsolated(databaseName, developmentDatabaseName) {
  if (!developmentDatabaseName) return;

  if (databaseName === developmentDatabaseName) {
    throw new Error(
      `Refusing to run the test suites against the development database "${databaseName}". ` +
        'Set TEST_DB_NAME to a separate database in .env.',
    );
  }
}
