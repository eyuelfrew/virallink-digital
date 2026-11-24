import crypto from 'node:crypto';
import env from '../config/env.js';

/**
 * Encryption for Telegram secrets at rest.
 *
 * Bot tokens, API hashes, phone numbers and MTProto session strings are
 * credentials: a database dump on its own must not let someone drive a person's
 * Telegram account. AES-256-GCM is used because it is authenticated — tampering
 * with a stored ciphertext fails loudly instead of decrypting to garbage.
 *
 * The key is derived from TELEGRAM_AUTO_REPLY_KEY when set, otherwise from the
 * existing JWT secret so a deployment works without a new environment variable.
 * Rotating either value makes previously stored secrets unreadable, which is the
 * intended behaviour and the reason the UI asks for the secret again rather than
 * showing it.
 */

function encryptionKey() {
  const secret = process.env.TELEGRAM_AUTO_REPLY_KEY || env.JWT_SECRET;
  return crypto.createHash('sha256').update(`telegram-auto-reply:${secret}`).digest();
}

export function encryptToken(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.from(
    JSON.stringify({
      v: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64'),
    }),
  ).toString('base64');
}

export function decryptToken(value) {
  const envelope = JSON.parse(Buffer.from(String(value), 'base64').toString('utf8'));
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function generateWebhookSecret() {
  return crypto.randomBytes(32).toString('hex');
}

export default { encryptToken, decryptToken, generateWebhookSecret };
