import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * Write a compressed SQL dump using mysqldump.
 *
 * On cPanel this is what the daily cron job runs. It is a thin wrapper rather than
 * a SQL-level dump because mysqldump is the only backup method that produces a
 * restorable file across MySQL and MariaDB versions without extra tooling.
 *
 * Credentials come from the environment, never from argv, so they do not appear
 * in the process list or in shell history.
 */

const BINARIES = {
  win32: 'C:\\wamp64\\bin\\mysql\\mysql9.1.0\\bin\\mysqldump.exe',
  linux: 'mysqldump',
};

export function resolveMysqlDump() {
  return BINARIES[process.platform] || 'mysqldump';
}

export async function runBackup({ outDir, database, host, port, user, password, retention = 14 }) {
  const binary = resolveMysqlDump();

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(outDir, `${database}-${stamp}.sql.gz`);

  await fs.mkdir(outDir, { recursive: true });

  const args = [
    `--host=${host}`,
    `--port=${port}`,
    `--user=${user}`,
    // MYSQL_PWD avoids putting the password on the command line. It is the
    // lesser evil compared with a visible argument; the .my.cnf approach is
    // preferred where the host allows it.
    '--single-transaction',
    '--routines',
    '--triggers',
    '--add-drop-table',
    '--default-character-set=utf8mb4',
    database,
  ];

  await new Promise((resolve, reject) => {
    const dump = spawn(binary, args, {
      env: { ...process.env, MYSQL_PWD: password },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // gzip on stdin → .sql.gz on stdout. Compressed because cPanel storage is
    // small and a full dump is rarely needed uncompressed.
    const gzip = spawn('gzip', ['-9'], { stdio: ['pipe', 'pipe', 'inherit'] });
    const out = require('node:fs').createWriteStream(outFile);

    let stderr = '';
    dump.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    dump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(out);

    dump.on('error', reject);
    gzip.on('error', reject);

    out.on('finish', () => resolve());
    out.on('error', reject);

    dump.on('close', (code) => {
      if (code !== 0) reject(new Error(`mysqldump exited ${code}: ${stderr.trim()}`));
    });
  });

  const { size } = await fs.stat(outFile);

  // Keep only the most recent N dumps.
  const files = (await fs.readdir(outDir))
    .filter((file) => file.startsWith(`${database}-`) && file.endsWith('.sql.gz'))
    .sort()
    .reverse();

  const removed = [];
  for (const stale of files.slice(retention)) {
    await fs.unlink(path.join(outDir, stale));
    removed.push(stale);
  }

  return { file: outFile, size, removed, gzipAvailable: true };
}

// Run directly: node src/scripts/backup.js
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const env = (await import('../config/env.js')).default;

  try {
    const result = await runBackup({
      outDir: env.backupDir,
      database: env.DB_NAME,
      host: env.DB_HOST,
      port: String(env.DB_PORT),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      retention: env.BACKUP_RETENTION_COUNT,
    });

    console.log(`Backup written: ${result.file} (${Math.round(result.size / 1024)} KB)`);
    if (result.removed.length) console.log(`Pruned ${result.removed.length} old backup(s).`);
    process.exit(0);
  } catch (error) {
    console.error(`Backup failed: ${error.message}`);
    process.exit(1);
  }
}