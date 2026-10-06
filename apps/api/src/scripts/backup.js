import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
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

const dump = spawn(binary, args, {
    env: { ...process.env, MYSQL_PWD: password },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const out = createWriteStream(outFile);

  let stderr = '';
  dump.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  /*
   * Compression uses Node's own zlib rather than piping into the `gzip` binary.
   *
   * Two reasons. `gzip` is a Unix tool, so the script could not be run on the
   * Windows development machine at all — which meant a backup script nobody could
   * test locally. And a spawned `gzip` cannot be reasoned about: this version
   * resolved on the *output stream finishing*, which also happens when the dump
   * dies, because the pipe closes cleanly on EOF. A failed mysqldump therefore
   * produced a truncated, near-empty .sql.gz and reported success — the single
   * worst failure mode a backup can have, because it is silent.
   *
   * Now the dump's exit code is checked first, and only a clean exit lets the
   * compression finish resolve. A partial file is deleted rather than kept.
   */
  const compress = createGzip({ level: 9 });

  const compressing = pipeline(dump.stdout, compress, out);

  const dumpExit = new Promise((resolve, reject) => {
    dump.on('error', reject);
    dump.on('close', (code) => {
      if (code !== 0) reject(new Error(`mysqldump exited ${code}: ${stderr.trim()}`));
      else resolve();
    });
  });

try {
    // Both must succeed: the dump has to have exited cleanly, and the
    // compression has to have flushed the whole thing to disk.
    await Promise.all([dumpExit, compressing]);
  } catch (error) {
    // Never leave a partial file behind. A truncated dump is worse than no dump,
    // because it looks like a backup and restores to an empty database.
    await fs.unlink(outFile).catch(() => {});
    throw error;
  }

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

  return { file: outFile, size, removed };
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