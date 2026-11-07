import env from '../config/env.js';
import { deleteWebhook, getMe, getWebhookInfo, isEnabled, setWebhook } from '../services/telegram.service.js';

/**
 * Manage the Telegram webhook from a shell.
 *
 *   npm run telegram:webhook -- set [https://host]   register the webhook
 *   npm run telegram:webhook -- delete               remove it
 *   npm run telegram:webhook                         show bot + webhook status
 *
 * The secret is embedded in the webhook path *and* sent to Telegram as the
 * `secret_token`, so the route can check both. Having it in a script rather than
 * a manual API call means the two halves can never drift apart.
 */

const action = (process.argv[2] || 'status').toLowerCase();

async function main() {
  if (!isEnabled()) {
    console.log('Telegram is disabled. Set TELEGRAM_ENABLED=true and TELEGRAM_BOT_TOKEN first.');
    return;
  }

  if (action === 'set') {
    const base = (process.argv[3] || env.TELEGRAM_WEBHOOK_URL || '').replace(/\/$/, '');
    if (!base) throw new Error('Provide the webhook base URL as an argument or set TELEGRAM_WEBHOOK_URL.');
    if (!env.TELEGRAM_WEBHOOK_SECRET) throw new Error('TELEGRAM_WEBHOOK_SECRET is required.');

    const url = `${base}/api/v1/telegram/webhook/${encodeURIComponent(env.TELEGRAM_WEBHOOK_SECRET)}`;
    await setWebhook(url, env.TELEGRAM_WEBHOOK_SECRET);

    const info = await getWebhookInfo();
    console.log(`Webhook set to ${url}`);
    console.log(JSON.stringify(info, null, 2));
    return;
  }

  if (action === 'delete') {
    await deleteWebhook();
    console.log('Webhook deleted.');
    return;
  }

  const me = await getMe();
  const info = await getWebhookInfo();
  console.log(`Bot: @${me.username} (id ${me.id})`);
  console.log(JSON.stringify(info, null, 2));
}

main().catch((error) => {
  console.error(`telegram:webhook failed: ${error.message}`);
  process.exit(1);
});
