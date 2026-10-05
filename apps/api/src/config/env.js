import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Monorepo-aware .env discovery. The app root on cPanel contains .env already;
 * locally it lives at the repo root, so walk upward from this file.
 */
function loadEnvFiles() {
  // here = <repo>/apps/api/src/config, so the monorepo root is four levels up.
  const candidates = [
    path.resolve(here, '../../../../.env'), // monorepo root (local dev)
    path.resolve(here, '../../../.env'), // apps/api/.env
    path.resolve(process.cwd(), '.env'), // process cwd (cPanel app root)
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      // The first match wins; also record where it came from for diagnostics.
      process.env.ENV_FILE_LOADED_FROM = candidate;
      return;
    }
  }
  dotenv.config();
}

loadEnvFiles();

/**
 * Coerce the string form of a boolean/number into a real one, and validate.
 * z.coerce.boolean() treats "false" as truthy, so booleans are parsed here.
 */
const booleanish = z
  .string()
  .transform((v) => ['true', '1', 'yes', 'on'].includes(v.toLowerCase()))
  .or(z.boolean());

const numericString = (fallback) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number());

const csv = (fallback = []) =>
  z
    .string()
    .optional()
    .transform((v) =>
      !v || !v.trim()
        ? fallback
        : v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    );

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: numericString(4000),
  API_HOST: z.string().default('127.0.0.1'),
  SITE_URL: z.string().url(),

  DB_HOST: z.string().min(1),
  DB_PORT: numericString(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_DIALECT: z.enum(['mysql', 'mariadb']).default('mysql'),
  DB_POOL_MAX: numericString(5),
  DB_POOL_MIN: numericString(0),
  DB_POOL_ACQUIRE_MS: numericString(30000),
  DB_POOL_IDLE_MS: numericString(10000),
  DB_SYNC_ALLOWED: booleanish.default('false'),
  DB_LOG_QUERIES: booleanish.default('false'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  COOKIE_SECURE: booleanish.default('false'),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_PATH: z.string().default('/'),
  BCRYPT_ROUNDS: numericString(12),
  LOGIN_MAX_ATTEMPTS: numericString(8),
  LOGIN_LOCK_MINUTES: numericString(15),

  CORS_ORIGINS: csv([process.env.SITE_URL]),

  /*
   * First-run bootstrap, on by default in every environment.
   *
   * These default to true rather than being switched on per environment because
   * the deployment target cannot run them any other way: cPanel only starts the
   * Node.js application, so there is no shell or npm-script button available to
   * apply a schema change. Making the app depend on a manual step would mean the
   * next deploy silently serves requests against a schema that is one migration
   * behind.
   *
   * Both steps are idempotent, and the migration step is serialised with a MySQL
   * advisory lock so the several Passenger processes that start together cannot
   * run the same migration at once. See config/bootstrap.js.
   *
   * Turning AUTO_MIGRATE off is only sensible for a host where a human *can* run
   * `npm run migrate` deliberately — a staging box, say. On this host, off means
   * the schema is never updated.
   */
  AUTO_MIGRATE: booleanish.default('true'),
  AUTO_SEED: booleanish.default('true'),

  RATE_LIMIT_WINDOW_MS: numericString(900000),
  // Per 15 minutes, and it now covers only the anonymous public surface — see the
  // note where it is mounted in app.js. One public page view fans out into
  // roughly eight API calls (company, services, portfolio, team, testimonials,
  // clients, blog, taxonomy), and in this deployment every one of them shares a
  // single key because they all arrive over loopback. At 300 the budget was
  // about 37 page views for the whole site, which a single busy visitor could
  // exhaust. Sized for browsing, not to make the limit unreachable.
  RATE_LIMIT_MAX: numericString(1200),
  RATE_LIMIT_AUTH_MAX: numericString(10),
  RATE_LIMIT_CONTACT_MAX: numericString(5),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  MEDIA_ROOT: z.string().default('./storage/media'),
  MEDIA_PUBLIC_URL: z.string().default('/media'),
  MEDIA_MAX_BYTES: numericString(10485760),
  MEDIA_ALLOWED_TYPES: csv(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']),

  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_PUBLIC_BASE_URL: z.string().optional(),

  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  LOG_PRETTY: booleanish.default('false'),

  ACTIVITY_RETENTION_DAYS: numericString(365),
  BACKUP_DIR: z.string().default('./storage/backups'),
  BACKUP_RETENTION_COUNT: numericString(14),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  console.error(
    `\nInvalid environment configuration.\n${issues}\n\n` +
      'Copy .env.example to .env and fill in the missing values.\n' +
      'Generate secrets with: openssl rand -base64 48\n',
  );
  process.exit(1);
}

const raw = parsed.data;

export const env = Object.freeze({
  ...raw,

  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isTest: raw.NODE_ENV === 'test',

  // Absolute path, resolved from the API app root so a relative MEDIA_ROOT in
  // .env cannot break depending on which directory the process was launched from.
  mediaRoot: path.isAbsolute(raw.MEDIA_ROOT)
    ? raw.MEDIA_ROOT
    : path.resolve(here, '../../../..', raw.MEDIA_ROOT),
  backupDir: path.isAbsolute(raw.BACKUP_DIR)
    ? raw.BACKUP_DIR
    : path.resolve(here, '../../../..', raw.BACKUP_DIR),

  // Fail fast on a production config that would be silently insecure.
  apiUrl: `http://${raw.API_HOST}:${raw.PORT}`,
});

if (env.isProduction) {
  const problems = [];

  if (!env.COOKIE_SECURE) {
    problems.push('COOKIE_SECURE must be true in production (HTTPS-only cookies)');
  }
  if (env.DB_SYNC_ALLOWED) {
    problems.push('DB_SYNC_ALLOWED must be false in production');
  }
  if (env.BCRYPT_ROUNDS < 12) {
    problems.push('BCRYPT_ROUNDS must be at least 12 in production');
  }
  if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
    problems.push('JWT_SECRET and JWT_REFRESH_SECRET must be different values');
  }
  if (!env.CORS_ORIGINS.length || env.CORS_ORIGINS.includes('*')) {
    problems.push('CORS_ORIGINS must be an explicit allowlist without "*" in production');
  }
  if (!env.SITE_URL.startsWith('https://')) {
    problems.push('SITE_URL must use https:// in production');
  }
  if (env.STORAGE_DRIVER === 's3' && (!env.STORAGE_BUCKET || !env.STORAGE_ACCESS_KEY)) {
    problems.push('STORAGE_DRIVER=s3 requires STORAGE_BUCKET and STORAGE_ACCESS_KEY');
  }

  if (problems.length) {
    console.error(`\nUnsafe production configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
}

export default env;