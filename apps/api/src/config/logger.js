import pino from 'pino';
import env from './env.js';

/**
 * Sensitive keys redacted from every log line. Anything password- or token-shaped
 * is dropped here so a stray `logger.info({ body })` can never leak credentials.
 */
const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-csrf-token"]',
  'res.headers["set-cookie"]',
  'password',
  'newPassword',
  'currentPassword',
  'confirmPassword',
  'token',
  'accessToken',
  'refreshToken',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  'body.password',
  'body.newPassword',
  'body.currentPassword',
  'body.token',
];

/** Log lines are truncated so a large base64 upload cannot flood the log file. */
const messageLimit = 2000;

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: redactPaths, censor: '[redacted]' },
  messageLimit,
  base: { service: 'virallink-api', env: env.NODE_ENV },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  ...(env.isDevelopment && env.LOG_PRETTY
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } } }
    : {}),
});

/**
 * Express error logging. In production the stack is logged server-side only and
 * the client receives a generic message with the request id for correlation.
 */
export function logError(error, context = {}) {
  const isClientError = error.statusCode && error.statusCode < 500;
  const level = isClientError ? 'warn' : 'error';
  logger[level](
    {
      err: { message: error.message, stack: error.stack, name: error.name },
      ...context,
    },
    `error: ${error.message}`,
  );
}

export default logger;