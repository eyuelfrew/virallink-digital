import env from '../config/env.js';
import { deleteWebhook, getMe, getWebhookInfo, isEnabled, setMyCommands, setWebhook } from '../services/telegram.service.js';

/**
 * Manage the Telegram webhook from a shell.
 *
 *   npm run telegram:webhook -- status              show bot + webhook status
 *   npm run telegram:webhook -- set [https://host]   register the webhook
 *   npm run telegram:webhook -- delete               remove it
 *
 * The secret is embedded in the webhook path *and* sent to Telegram as
 * `secret_token`, so the route can check both. Having it in a script rather
 * than a manual API call means the two halves can never drift apart.
 *
 * The `status` action is worth running after any restart. A webhook that
 * points at a tunnel which is no longer up fails *silently* from the inside:
 * the bot simply never hears anything, so accounts cannot be linked and
 * passwords cannot be recovered, with nothing in the application's own logs
 * to say why.
 */

const action = (process.argv[2] || 'status').toLowerCase();

/**
 * Summarise the registered webhook and whether it is actually working.
 *
 * Telegram reports the last delivery failure, which is the signal that
 * matters: `last_error_message` is set when Telegram could not reach the URL,
 * and the message says why.
 */
async function reportStatus() {
  const me = await getMe();
  const info = await getWebhookInfo();

  console.log(`Bot: @${me.username} (id ${me.id})`);
  console.log(`Webhook URL: ${info.url || '(not registered)'}`);
  console.log(`Pending updates: ${info.pending_update_count}`);

  if (info.last_error_date) {
    console.log(`Last error (${new Date(info.last_error_date * 1000).toISOString()}):`);
    console.log(`  ${info.last_error_message}`);
  }

  if (!info.url) {
    console.log('\nNo webhook is registered. The bot cannot receive updates.');
    return;
  }

  if (info.last_error_message) {
    console.log(
      '\nThe webhook is registered but Telegram cannot reach it. Nothing the bot does ' +
        'will work until this is fixed: accounts cannot be linked, and password ' +
        'reset codes cannot be delivered.',
    );
    return;
  }

  if (env.TELEGRAM_WEBHOOK_URL && !info.url.startsWith(env.TELEGRAM_WEBHOOK_URL)) {
    console.log(
      `\nThe registered URL does not match TELEGRAM_WEBHOOK_URL (${env.TELEGRAM_WEBHOOK_URL}). ` +
        'Re-register it if this is the wrong environment.',
    );
  }

  console.log('\nWebhook looks healthy.');
}

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
    await setMyCommands([
      { command: 'start', description: 'Start the chat' },
      { command: 'menu', description: 'Open the interactive menu' },
      { command: 'help', description: 'How this bot works' },
    ]).catch(() => {});

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

  await reportStatus();
}

main().catch((error) => {
  console.error(`telegram:webhook failed: ${error.message}`);
  process.exit(1);
});
