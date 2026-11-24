import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Monorepo-aware .env discovery.
 *
 * Several .env files can exist at once: the cPanel app root, the API app
 * directory, and the repository root. Loading only the *first* one found led to
 * a stale repository-root file silently overriding the values the user had
 * edited in the app-root .env — most visibly CORS_ORIGINS.
 *
 * Load every candidate instead, highest priority first. dotenv never overwrites
 * a value already present, so:
 *   1. cPanel's Environment Variables UI wins (they are already in process.env)
 *   2. the app root .env wins over repository-root leftovers
 *   3. later files only fill in variables that are still missing
 */
function loadEnvFiles() {
  // here = <repo>/apps/api/src/config.
  const candidates = [
    path.resolve(process.cwd(), '.env'), // cPanel app root (highest on the server)
    path.resolve(here, '../../.env'), // apps/api/.env
    path.resolve(here, '../../../.env'), // apps/.env
    path.resolve(here, '../../../../.env'), // monorepo root (local dev)
  ];

  const loaded = [];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, quiet: true });
      loaded.push(candidate);
    }
  }

  process.env.ENV_FILE_LOADED_FROM = loaded.length ? [...new Set(loaded)].join(', ') : '(none)';
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
  // Password recovery. Generous, because this limiter sees one shared bucket
  // for the whole site; the per-account limits are what actually constrain it.
  RATE_LIMIT_PASSWORD_RESET_MAX: numericString(20),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  MEDIA_ROOT: z.string().default('./storage/media'),
  MEDIA_PUBLIC_URL: z.string().default('/media'),
  MEDIA_MAX_BYTES: numericString(10485760),
  MEDIA_ALLOWED_TYPES: csv([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'image/gif',
    // Audio, for the Telegram auto-reply voice messages. Stored as uploaded.
    'audio/mpeg',
    'audio/mp4',
    'audio/x-m4a',
    'audio/aac',
    'audio/ogg',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/flac',
  ]),

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

  /*
   * Telegram bot.
   *
   * Off by default so a deployment without a bot is not broken by its absence:
   * every code path checks `TELEGRAM_ENABLED` first and no-ops otherwise. When
   * on, the webhook secret is required — it is what stops a stranger who finds
   * the webhook URL from driving the bot.
   */
  TELEGRAM_ENABLED: booleanish.default('false'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().optional(),
  TELEGRAM_ANNOUNCE_CHAT_ID: z.string().optional(),
  TELEGRAM_LINK_CODE_TTL_MINUTES: numericString(30),
  /**
   * How long to wait for the Telegram API.
   *
   * Generous on purpose. The API is not always close by — from a slow
   * connection it can take eight seconds to answer, and a ten-second deadline
   * turns that into a failed delivery and a lost password-reset code. The
   * outbox retries, but a code that arrives after its own lifetime is a code
   * the person cannot use.
   */
  TELEGRAM_API_TIMEOUT_MS: numericString(30000),
  /**
   * Optional dedicated key for encrypting stored Telegram bot tokens and
   * personal-account sessions. Falls back to JWT_SECRET so an existing
   * deployment keeps working without a new variable.
   */
  TELEGRAM_AUTO_REPLY_KEY: z.string().optional(),

  /*
   * Password recovery.
   *
   * A reset code is delivered over Telegram, so it is short-lived and
   * single-use. These limits are the real defence, and they are per-account
   * rather than per-IP on purpose: in this deployment every request reaches
   * the API over loopback, so the in-memory rate limiter sees one shared
   * bucket for the whole site and can only ever be a blunt instrument.
   *
   * A six-digit code has a million possible values, which is why the attempt
   * cap matters — without it the code could be guessed inside its lifetime.
   */
  PASSWORD_RESET_CODE_TTL_MINUTES: numericString(10),
  PASSWORD_RESET_MAX_ATTEMPTS: numericString(5),
  PASSWORD_RESET_MAX_SENDS_PER_HOUR: numericString(3),
  PASSWORD_RESET_RESEND_SECONDS: numericString(60),
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
  if (env.TELEGRAM_ENABLED) {
    if (!env.TELEGRAM_BOT_TOKEN) problems.push('TELEGRAM_ENABLED requires TELEGRAM_BOT_TOKEN');
    if (!env.TELEGRAM_WEBHOOK_SECRET) {
      problems.push('TELEGRAM_ENABLED requires TELEGRAM_WEBHOOK_SECRET (guards the public webhook)');
    }
  }

  if (problems.length) {
    console.error(`\nUnsafe production configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`);
    process.exit(1);
  }
}

export default env;