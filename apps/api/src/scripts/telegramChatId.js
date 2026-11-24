import env from '../config/env.js';
import {
  deleteWebhook,
  getUpdates,
  getWebhookInfo,
  isEnabled,
  setMyCommands,
  setWebhook,
} from '../services/telegram.service.js';

/**
 * Read the chat ids Telegram has queued.
 *
 *   npm run telegram:chatid
 *
 * This exists for the situation where there is no stable public address for
 * the API — a laptop behind NAT, or a development machine with no domain yet.
 * Telegram will only deliver an update inbound, and the bot cannot be reached
 * inbound until it has a webhook pointing at a public URL, so the chat id
 * cannot be learned the usual way.
 *
 * The queue is the way round that loop. Telegram refuses `getUpdates` while a
 * webhook is registered, so this script removes the webhook, waits for a
 * message, and puts the webhook back afterwards.
 *
 * It is for finding *your own* chat id. Nothing here proves anything about
 * who sent a message — that is what the linking flow is for, and it proves
 * ownership by the secret carried in the link.
 */

/** Everything worth knowing about one update. */
function describe(update) {
  const message = update?.message || update?.callback_query?.message;
  if (!message) return null;

  const chat = message.chat || {};
  const from = update?.message?.from || update?.callback_query?.from || {};

  return {
    updateId: update.update_id,
    chatId: chat.id ?? null,
    username: from.username || null,
    firstName: from.first_name || null,
    text: String(message.text || message.caption || '').slice(0, 120),
  };
}

/**
 * Wait for an update to arrive.
 *
 * Telegram's long polling holds the request open, so this asks for a fifteen
 * second wait rather than polling in a tight loop.
 */
async function waitForUpdates(seconds) {
  const deadline = Date.now() + seconds * 1000;
  const seen = new Map();

  while (Date.now() < deadline) {
    let updates = [];
    try {
      updates = await getUpdates({ timeoutSeconds: 15, limit: 50 });
    } catch {
      updates = [];
    }

    for (const update of Array.isArray(updates) ? updates : []) {
      if (!seen.has(update.update_id)) seen.set(update.update_id, update);
    }

    if (seen.size) return [...seen.values()];
  }

  return [...seen.values()];
}

async function main() {
  if (!isEnabled()) {
    console.log('Telegram is disabled. Set TELEGRAM_ENABLED=true and TELEGRAM_BOT_TOKEN first.');
    return;
  }

  const info = await getWebhookInfo();
  const wasRegistered = Boolean(info.url);

  try {
    if (wasRegistered) {
      console.log('Removing the webhook — Telegram only queues updates while none is registered.');
      await deleteWebhook();
    }

    console.log('\nOpen the bot in Telegram and send it a message (anything will do).');
    console.log('Waiting up to 30 seconds…\n');

    const updates = await waitForUpdates(30);
    const rows = updates.map(describe).filter(Boolean);

    if (!rows.length) {
      console.log('Nothing arrived. Send the bot a message and run this again.');
    } else {
      console.log('Queued updates:\n');

      for (const row of rows) {
        console.log(`  chat id:   ${row.chatId}`);
        console.log(`  username:  @${row.username ?? '(none — the account has no username set)'}`);
        console.log(`  name:      ${row.firstName ?? '(unknown)'}`);
        console.log(`  said:      ${row.text || '(no text)'}`);
        console.log('');
      }

      console.log('To receive reset codes without a public URL, put the chat id in that');
      console.log('account\'s "Telegram chat id" field (Settings → Users → edit).');
    }
  } finally {
    /*
     * Put the webhook back. Reading the queue empties it, so the next
     * `/start` the person sends would otherwise be lost — and that is exactly
     * the message the linking flow depends on.
     *
     * This runs whatever happened above, including a failure part-way through
     * the removal, because leaving the bot with no webhook at all is worse
     * than the problem the script was solving.
     */
    if (wasRegistered) {
      if (!env.TELEGRAM_WEBHOOK_SECRET) {
        console.log(
          '\nThe webhook was removed and could not be restored: TELEGRAM_WEBHOOK_SECRET is ' +
            'not set. Re-register it with "npm run telegram:webhook -- set <public-url>".',
        );
      } else {
        const restoreUrl = env.TELEGRAM_WEBHOOK_URL
          ? `${env.TELEGRAM_WEBHOOK_URL.replace(/\/+$/, '')}/api/v1/telegram/webhook/${encodeURIComponent(env.TELEGRAM_WEBHOOK_SECRET)}`
          : info.url;

        try {
          await setWebhook(restoreUrl, env.TELEGRAM_WEBHOOK_SECRET);
          await setMyCommands([
            { command: 'start', description: 'Start the chat' },
            { command: 'menu', description: 'Open the interactive menu' },
            { command: 'help', description: 'How this bot works' },
          ]).catch(() => {});

          console.log(`\nWebhook restored to ${restoreUrl}`);
        } catch (error) {
          /*
           * Telegram refuses a URL it cannot resolve, which is the normal
           * outcome when the previous webhook pointed at a tunnel that has
           * since stopped. Saying so is more useful than a stack trace, and
           * the state it leaves behind is not a problem: with no webhook
           * Telegram queues updates instead of delivering them, and
           * `getUpdates` — which this script uses — keeps working.
           */
          console.log(
            `\nCould not restore the webhook: ${error.message}\n` +
              'The bot is now in queue mode: Telegram holds updates instead of delivering ' +
              'them, and "npm run telegram:chatid" can still read them.\n' +
              'Register a working URL with "npm run telegram:webhook -- set <public-url>" ' +
              'when you have one.',
          );
        }
      }
    }
  }
}

main().catch((error) => {
  console.error(`telegram:chatid failed: ${error.message}`);
  process.exit(1);
});
