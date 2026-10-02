import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Run the API test suites and summarise the results.
 *
 * The suites are plain scripts rather than a test-runner CLI, so this runs them
 * as child processes and reads their output. Each exits non-zero on failure.
 */

const run = promisify(execFile);

// This file lives in apps/api/scripts, so the app root is one level up.
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const suites = [
  { name: 'smoke', file: 'test/smoke.js' },
  { name: 'auth', file: 'test/auth.js' },
];

let failures = 0;

for (const suite of suites) {
  console.log(`\n--- ${suite.name} ---`);

  try {
    const { stdout } = await run(process.execPath, [suite.file], {
      cwd: APP_ROOT,
      // LOG_LEVEL is set so the report is not buried in request logs.
      env: { ...process.env, LOG_LEVEL: 'silent' },
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

process.exit(failures ? 1 : 0);