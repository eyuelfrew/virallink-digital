import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  APP_ROOT,
  assertIsolated,
  loadRootEnv,
  readEnvValue,
  testDatabaseName,
} from './test-db.js';

/**
 * Run the API test suites and summarise the results.
 *
 * The suites are plain scripts rather than a test-runner CLI, so this runs them
 * as child processes and reads their output. Each exits non-zero on failure.
 *
 * They run against a separate database (`virallink_test` by default), never the
 * development one. The suites create employees, clients, services, projects and
 * tasks to exercise the RBAC rules, and they leave some of that behind — running
 * them against the development database is what fills the admin screens with
 * fixture rows such as "Search Person" or "Editor Project".
 */
const run = promisify(execFile);

loadRootEnv();

const database = testDatabaseName();
assertIsolated(database, readEnvValue('DB_NAME'));

const suites = [
  { name: 'smoke', file: 'test/smoke.js' },
  { name: 'auth', file: 'test/auth.js' },
  { name: 'password-reset', file: 'test/password-reset.js' },
  { name: 'employee-link', file: 'test/employee-link.js' },
];

let failures = 0;

/*
 * Prepare the isolated database first: create it, apply the migrations and
 * seed the RBAC baseline the suites assert against.
 */
try {
  const { stdout } = await run(process.execPath, ['scripts/prepare-test-db.mjs'], {
    cwd: APP_ROOT,
    env: { ...process.env },
    maxBuffer: 10 * 1024 * 1024,
  });

  process.stdout.write(stdout);
} catch (error) {
  console.log(`  could not prepare the test database:\n${error.stdout?.slice(-800) || error.message}`);
  process.exit(1);
}

for (const suite of suites) {
  console.log(`\n--- ${suite.name} ---`);

  try {
    const { stdout } = await run(process.execPath, [suite.file], {
      cwd: APP_ROOT,
      // LOG_LEVEL is set so the report is not buried in request logs.
      // DB_NAME points at the isolated test database, never the development one.
      env: { ...process.env, DB_NAME: database, LOG_LEVEL: 'silent' },
      maxBuffer: 10 * 1024 * 1024,
    });

    const lines = stdout.split('\n').filter((line) => /^\[(PASS|FAIL)\]|passed$/.test(line.trim()));

    for (const line of lines) {
      if (line.startsWith('[FAIL]')) console.log(`  ${line}`);
    }

    const summary = lines.find((line) => line.includes('passed')) || 'no summary';
    console.log(`  ${summary.trim()}`);

    if (summary.includes('FAIL')) failures += 1;
  } catch (error) {
    console.log(`  suite failed to run:\n${error.stdout?.slice(-800) || error.message}`);
    failures += 1;
  }
}

console.log(`\nSuites ran against the "${database}" database.`);

process.exit(failures ? 1 : 0);
