/**
 * Password recovery and administration tests.
 *
 * Covers the properties the recovery flow depends on, which are easy to break
 * and hard to notice:
 *
 *   1. the request endpoint does not reveal who has an account;
 *   2. the code is stored hashed and cannot be guessed without limit;
 *   3. a reset revokes every session and clears the lockout;
 *   4. a code delivered through a Telegram link goes only to the chat whose
 *      username is registered on the account;
 *   5. an administrator's reset forces the holder to choose their own password.
 *
 * The negative assertions matter most. An endpoint that answers differently
 * for "no such account" and "here is your code" is an account-existence
 * oracle, and the difference is invisible until somebody writes it that way.
 *
 * Each scenario uses its own account. That is not tidiness: the flow has a
 * per-account send limit — one code a minute, three an hour — so reusing one
 * account would test the limit instead of the thing under test.
 *
 * The imports below are dynamic rather than static. A static `import` is
 * hoisted and evaluated before any statement in the module body runs, so
 * `process.env.LOG_LEVEL = 'silent'` below would execute *after* the logger
 * had already been built at its default level — and this file would bury its
 * own report in request logs. Awaiting the imports puts the assignment first.
 */
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

const { createApp } = await import('../src/app.js');
const { default: sequelize } = await import('../src/config/database.js');
const { default: env } = await import('../src/config/env.js');
const { default: bcrypt } = await import('bcrypt');
const { default: models } = await import('../src/models/index.js');
const { default: crypto } = await import('node:crypto');
const { Op } = await import('sequelize');
const { redeemDeliveryToken } = await import('../src/services/password-reset.service.js');

const { User, Role, PasswordResetToken, RefreshToken, TelegramOutbox } = models;

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

/** Minimal cookie jar, so each identity keeps its own session. */
function createClient() {
  const cookies = new Map();

  return async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };

    if (cookies.size) {
      headers.cookie = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }

    const response = await fetch(`${base}${path}`, { ...options, headers });

    for (const raw of response.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    return { status: response.status, body, text };
  };
}

const post = (payload) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

await sequelize.authenticate();

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                     */
/* -------------------------------------------------------------------------- */

const ADMIN_EMAIL = 'reset.admin@virallink.test';
const SUPER_ADMIN_PASSWORD = 'ResetAdmin123!';

const OLD_PASSWORD = 'OldPassword123!';
const NEW_PASSWORD = 'BrandNewPassword456!';

/**
 * A chat id that will never exist, so a delivery attempt fails harmlessly.
 *
 * `telegram_chat_id` carries a unique index, so each account that needs one
 * gets its own.
 */
let fakeChatCounter = 900000000;
const nextFakeChat = () => (fakeChatCounter += 1);

const createdAccounts = [];

async function makeAccount(email, { telegramChatId = null, telegramUsername = null } = {}) {
  const existing = await User.findOne({ where: { email }, paranoid: false });

  if (existing) {
    if (existing.deletedAt) await existing.restore();
    await existing.update({
      name: 'Reset Tester',
      passwordHash: await bcrypt.hash(OLD_PASSWORD, env.BCRYPT_ROUNDS),
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
      telegramChatId,
      telegramUsername,
    });
  } else {
    await User.create({
      name: 'Reset Tester',
      email,
      passwordHash: await bcrypt.hash(OLD_PASSWORD, env.BCRYPT_ROUNDS),
      isActive: true,
      telegramChatId,
      telegramUsername,
    });
  }

  const user = await User.findOne({ where: { email } });
  createdAccounts.push(user.id);

  /*
   * Clear this account's rows from a previous run.
   *
   * The flow has a per-account cooldown and an hourly cap, so a leftover row
   * from last time would make the next request look like a resend and the
   * test would be measuring the limit instead of the thing under test.
   */
  await PasswordResetToken.destroy({ where: { userId: user.id }, force: true });
  await RefreshToken.destroy({ where: { userId: user.id }, force: true });

  return user;
}

const adminUser = await (async () => {
  const existing = await User.findOne({ where: { email: ADMIN_EMAIL }, paranoid: false });

  if (existing) {
    if (existing.deletedAt) await existing.restore();
    await existing.update({
      name: 'Reset Admin',
      passwordHash: await bcrypt.hash(SUPER_ADMIN_PASSWORD, env.BCRYPT_ROUNDS),
      isActive: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
    });
  } else {
    await User.create({
      name: 'Reset Admin',
      email: ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(SUPER_ADMIN_PASSWORD, env.BCRYPT_ROUNDS),
      isActive: true,
    });
  }

  const user = await User.findOne({ where: { email: ADMIN_EMAIL } });
  createdAccounts.push(user.id);
  return user;
})();

const superAdminRole = await Role.findOne({ where: { key: 'SUPER_ADMIN' } });
if (!superAdminRole) throw new Error('SUPER_ADMIN role is missing — run "npm run seed" first');
await adminUser.setRoles([superAdminRole]);

/** Remove rows a previous run left behind, so the counts below are meaningful. */
await PasswordResetToken.destroy({ where: { userId: createdAccounts }, force: true });
await RefreshToken.destroy({ where: { userId: createdAccounts }, force: true });

/* -------------------------------------------------------------------------- */
/* 1. The request endpoint must not reveal who has an account                    */
/* -------------------------------------------------------------------------- */

const anonymous = createClient();

const known = await makeAccount('reset.known@virallink.test', { telegramUsername: 'known_person' });

const unknownAddress = await anonymous('/api/v1/auth/forgot-password', post({ email: 'nobody@virallink.test' }));
record('forgot-password accepts an unknown address', unknownAddress.status === 200, `got ${unknownAddress.status}`);

const knownAddress = await anonymous('/api/v1/auth/forgot-password', post({ email: known.email }));
record('forgot-password accepts a known address', knownAddress.status === 200, `got ${knownAddress.status}`);

/*
 * The two answers must have the same shape and the same wording.
 *
 * They cannot be byte-identical: the deep link carries a one-time token, so
 * every request gets a different one. What matters is that the response says
 * nothing about whether the account exists — same fields, same message, same
 * status.
 */
const unknownShape = Object.keys(unknownAddress.body?.data || {}).sort().join(',');
const knownShape = Object.keys(knownAddress.body?.data || {}).sort().join(',');

record('the two answers have the same shape', unknownShape === knownShape, `${unknownShape} vs ${knownShape}`);
record(
  'the two answers say the same thing',
  unknownAddress.body?.data?.message === knownAddress.body?.data?.message,
  knownAddress.body?.data?.message,
);
record(
  'a link is offered either way',
  typeof unknownAddress.body?.data?.url === 'string' && typeof knownAddress.body?.data?.url === 'string',
);
record(
  'the link points at the bot with a one-time token',
  /^https:\/\/t\.me\/[^/]+\?start=r_[0-9a-f]{32}$/.test(unknownAddress.body?.data?.url || ''),
  unknownAddress.body?.data?.url,
);
record(
  'no request row exists for an address that has no account',
  (await PasswordResetToken.count({ where: { userId: -1 } })) === 0,
);

/* -------------------------------------------------------------------------- */
/* 2. Sending is limited per account                                            */
/* -------------------------------------------------------------------------- */

const limited = await makeAccount('reset.limited@virallink.test', { telegramUsername: 'limited_person' });

const firstRequest = await anonymous('/api/v1/auth/forgot-password', post({ email: limited.email }));
record('the first request is accepted', firstRequest.status === 200, `got ${firstRequest.status}`);

const secondRequest = await anonymous('/api/v1/auth/forgot-password', post({ email: limited.email }));
record('a second request inside the cooldown is still answered with 200', secondRequest.status === 200);
record(
  'but it offers no second link',
  secondRequest.body?.data?.url === null,
  secondRequest.body?.data?.url,
);
record(
  'the response still says the same thing',
  secondRequest.body?.data?.message === firstRequest.body?.data?.message,
);

const rowsAfterCooldown = await PasswordResetToken.count({ where: { userId: limited.id } });
record('the cooldown prevented a second request row', rowsAfterCooldown === 1, `rows=${rowsAfterCooldown}`);

/*
 * The hourly cap is reached after three codes.
 *
 * Each existing row is aged to just past the cooldown — but still inside the
 * hour — so that the cooldown does not stop the next request and the hourly
 * count is the only limit in play.
 */
const past = new Date(Date.now() - (env.PASSWORD_RESET_RESEND_SECONDS + 5) * 1000);

for (let index = 0; index < 3; index += 1) {
  const row = await PasswordResetToken.findOne({ where: { userId: limited.id }, order: [['id', 'DESC']] });
  if (row) {
    // The static update, not `instance.update`: Sequelize protects `createdAt`
    // on save and silently ignores a change to it.
    await PasswordResetToken.update({ createdAt: past }, { where: { id: row.id } });
  }
  await anonymous('/api/v1/auth/forgot-password', post({ email: limited.email }));
}

const hourlyRows = await PasswordResetToken.count({ where: { userId: limited.id } });
record('the hourly cap stopped further requests', hourlyRows === 3, `rows=${hourlyRows}`);

/* -------------------------------------------------------------------------- */
/* 3. A linked chat receives the code directly                                   */
/* -------------------------------------------------------------------------- */

const linked = await makeAccount('reset.linked@virallink.test', { telegramChatId: nextFakeChat() });

const linkedRequest = await anonymous('/api/v1/auth/forgot-password', post({ email: linked.email }));
record('the request is accepted', linkedRequest.status === 200, `got ${linkedRequest.status}`);

const linkedToken = await PasswordResetToken.findOne({ where: { userId: linked.id }, order: [['id', 'DESC']] });
record('a request row was created', Boolean(linkedToken));
record('the code is never stored in plain text', linkedToken ? !/^\d{6}$/.test(linkedToken.codeHash || '') : false);
record('the stored digest is a sha256 hex string', linkedToken ? /^[0-9a-f]{64}$/.test(linkedToken.codeHash || '') : false);
record('the delivery token is hashed at rest too', linkedToken ? /^[0-9a-f]{64}$/.test(linkedToken.deliveryTokenHash || '') : false);

/* -------------------------------------------------------------------------- */
/* 4. Delivery through a Telegram link                                          */
/* -------------------------------------------------------------------------- */

/*
 * A bot cannot message a chat that has never spoken to it, so for an account
 * with no linked chat the code comes back through a link that starts the bot.
 *
 * The link can be opened by anybody, so the bot sends a *working* code only to
 * a chat whose @username matches the one registered on the account. Everybody
 * else gets a code that does not work — and a reply that looks identical, so
 * the link cannot be used to find out who has an account.
 */

const viaLink = await makeAccount('reset.link@virallink.test', { telegramUsername: 'link_person' });

const linkRequest = await anonymous('/api/v1/auth/forgot-password', post({ email: viaLink.email }));
record('a link request is accepted', linkRequest.status === 200, `got ${linkRequest.status}`);

const linkTokenPart = (linkRequest.body?.data?.url || '').split('?start=')[1] || '';
record('the request produced a one-time link token', /^r_[0-9a-f]{32}$/.test(linkTokenPart), linkTokenPart);

const linkRow = await PasswordResetToken.findOne({ where: { userId: viaLink.id }, order: [['id', 'DESC']] });
record('no code exists yet — it is made when the link is opened', linkRow?.codeHash === null);

const delivered = await redeemDeliveryToken(linkTokenPart, { chatId: 555000111, username: 'link_person' });
record('the registered chat receives a code', Boolean(delivered?.code));
record('the code is six digits', /^\d{6}$/.test(delivered?.code || ''));
record('the delivery was accepted', delivered?.valid === true);

const afterDelivery = await PasswordResetToken.findOne({ where: { id: linkRow.id } });
record('the code was stored hashed', /^[0-9a-f]{64}$/.test(afterDelivery?.codeHash || ''));
record('the delivery was recorded', Boolean(afterDelivery?.deliveredAt));
record('the chat that received it was recorded', String(afterDelivery?.deliveryChatId) === '555000111');

const nowLinked = await User.findByPk(viaLink.id);
record(
  'the chat that proved itself was linked to the account',
  String(nowLinked.telegramChatId) === '555000111',
  `chat=${nowLinked.telegramChatId}`,
);

const redeemDelivered = await anonymous('/api/v1/auth/reset-password', post({
  email: viaLink.email,
  code: delivered.code,
  newPassword: NEW_PASSWORD,
}));
record('the delivered code changes the password', redeemDelivered.status === 200, `got ${redeemDelivered.status}`);

/* The wrong chat gets a code that does not work, and the same reply. */

const wrongAccount = await makeAccount('reset.wrong@virallink.test', { telegramUsername: 'wrong_person' });

const wrongRequest = await anonymous('/api/v1/auth/forgot-password', post({ email: wrongAccount.email }));
const wrongTokenPart = (wrongRequest.body?.data?.url || '').split('?start=')[1] || '';

const wrongChat = await redeemDeliveryToken(wrongTokenPart, { chatId: 999888777, username: 'someone_else' });
record('a chat that is not the registered one still receives six digits', /^\d{6}$/.test(wrongChat?.code || ''));
record('but it is not accepted', wrongChat?.valid === false);

const wrongRedeem = await anonymous('/api/v1/auth/reset-password', post({
  email: wrongAccount.email,
  code: wrongChat.code,
  newPassword: 'ShouldNotWork123!',
}));
record('and that code does not work', wrongRedeem.status === 400, `got ${wrongRedeem.status}`);

const stillOld = await User.findByPk(wrongAccount.id);
record('the password was not changed', await bcrypt.compare(OLD_PASSWORD, stillOld.passwordHash));

/* An unknown link behaves the same way. */

const unknownDelivery = await redeemDeliveryToken(`r_${'0'.repeat(32)}`, { chatId: 1, username: 'link_person' });
record('an unknown link still receives six digits', /^\d{6}$/.test(unknownDelivery?.code || ''));
record('but it is not accepted', unknownDelivery?.valid === false);

/* -------------------------------------------------------------------------- */
/* 5. Wrong codes are refused, and each guess is charged                          */
/* -------------------------------------------------------------------------- */

const target = await makeAccount('reset.target@virallink.test', { telegramChatId: nextFakeChat() });

await anonymous('/api/v1/auth/forgot-password', post({ email: target.email }));

const token = await PasswordResetToken.findOne({ where: { userId: target.id }, order: [['id', 'DESC']] });

const REAL_CODE = '482913';
await token.update({
  codeHash: crypto.createHash('sha256').update(`${target.id}:${REAL_CODE}`).digest('hex'),
});

const wrongCode = await anonymous('/api/v1/auth/reset-password', post({
  email: target.email,
  code: '000000',
  newPassword: NEW_PASSWORD,
}));

record('a wrong code is refused', wrongCode.status === 400, `got ${wrongCode.status}`);
record(
  'the refusal does not say the code was wrong',
  !/wrong|incorrect|mismatch|expired code/i.test(wrongCode.body?.error?.message || ''),
  wrongCode.body?.error?.message,
);

const charged = await PasswordResetToken.findOne({ where: { id: token.id } });
record('the guess was charged against the code', charged?.attempts === 1, `attempts=${charged?.attempts}`);

const stillWorks = await User.findByPk(target.id);
record('the old password still works after a wrong code', await bcrypt.compare(OLD_PASSWORD, stillWorks.passwordHash));

/* -------------------------------------------------------------------------- */
/* 6. The correct code changes the password and revokes everything               */
/* -------------------------------------------------------------------------- */

await RefreshToken.create({
  userId: target.id,
  tokenId: `test-${crypto.randomBytes(8).toString('hex')}`,
  expiresAt: new Date(Date.now() + 3600 * 1000),
  ip: '127.0.0.1',
  userAgent: 'password-reset-suite',
});

const correctCode = await anonymous('/api/v1/auth/reset-password', post({
  email: target.email,
  code: REAL_CODE,
  newPassword: NEW_PASSWORD,
}));

record('the correct code is accepted', correctCode.status === 200, `got ${correctCode.status} ${JSON.stringify(correctCode.body?.error || '')}`);

const afterReset = await User.findByPk(target.id);
record('the new password verifies', await bcrypt.compare(NEW_PASSWORD, afterReset.passwordHash));
record('the old password no longer verifies', !(await bcrypt.compare(OLD_PASSWORD, afterReset.passwordHash)));
record('the token version was bumped', afterReset.tokenVersion > 0, `tokenVersion=${afterReset.tokenVersion}`);
record('the lockout was cleared', afterReset.failedLoginAttempts === 0 && afterReset.lockedUntil === null);

const liveSessions = await RefreshToken.count({ where: { userId: target.id, revokedAt: null } });
record('every session was revoked', liveSessions === 0, `live=${liveSessions}`);

const spent = await PasswordResetToken.findOne({ where: { id: token.id } });
record('the code was consumed', Boolean(spent.consumedAt));

/* -------------------------------------------------------------------------- */
/* 7. A spent code cannot be replayed                                            */
/* -------------------------------------------------------------------------- */

const replay = await anonymous('/api/v1/auth/reset-password', post({
  email: target.email,
  code: REAL_CODE,
  newPassword: 'AnotherPassword789!',
}));

record('a replayed code is refused', replay.status === 400, `got ${replay.status}`);

const afterReplay = await User.findByPk(target.id);
record('the password was not changed again', await bcrypt.compare(NEW_PASSWORD, afterReplay.passwordHash));

/* -------------------------------------------------------------------------- */
/* 8. An administrator issues a password                                         */
/* -------------------------------------------------------------------------- */

const adminClient = createClient();
const adminLogin = await adminClient('/api/v1/auth/login', post({ email: ADMIN_EMAIL, password: SUPER_ADMIN_PASSWORD }));
record('the administrator can sign in', adminLogin.status === 200, `got ${adminLogin.status}`);

// Lock the target out, the way too many failures would.
await target.update({
  failedLoginAttempts: 8,
  lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
});

const lockedOut = await anonymous('/api/v1/auth/login', post({ email: target.email, password: NEW_PASSWORD }));
record('the locked account cannot sign in', lockedOut.status === 401, `got ${lockedOut.status}`);
record(
  'the refusal names the lockout',
  /too many failed attempts/i.test(lockedOut.body?.error?.message || ''),
  lockedOut.body?.error?.message,
);

const adminReset = await adminClient(`/api/v1/users/${target.id}/reset-password`, post({}));
record('the administrator can issue a password', adminReset.status === 200, `got ${adminReset.status} ${JSON.stringify(adminReset.body?.error || '')}`);

const temporaryPassword = adminReset.body?.data?.temporaryPassword;
record('a temporary password is returned', typeof temporaryPassword === 'string' && temporaryPassword.length >= 12);
record(
  'the temporary password satisfies the policy',
  typeof temporaryPassword === 'string' &&
    /[a-z]/.test(temporaryPassword) &&
    /[A-Z]/.test(temporaryPassword) &&
    /\d/.test(temporaryPassword),
);

const afterAdminReset = await User.findByPk(target.id);
record('the lockout was cleared by the reset', afterAdminReset.failedLoginAttempts === 0 && afterAdminReset.lockedUntil === null);
record('a password change is required', afterAdminReset.mustChangePassword === true);
record('the temporary password verifies', await bcrypt.compare(temporaryPassword, afterAdminReset.passwordHash));

const unauthenticatedReset = await anonymous(`/api/v1/users/${target.id}/reset-password`, post({}));
record('an unauthenticated reset is refused', unauthenticatedReset.status === 401, `got ${unauthenticatedReset.status}`);

/* -------------------------------------------------------------------------- */
/* 9. A forced password change is enforced by the API                            */
/* -------------------------------------------------------------------------- */

const targetClient = createClient();
const targetLogin = await targetClient('/api/v1/auth/login', post({ email: target.email, password: temporaryPassword }));
record('the holder can sign in with the temporary password', targetLogin.status === 200, `got ${targetLogin.status}`);
record(
  'the session is flagged as needing a password change',
  targetLogin.body?.data?.user?.mustChangePassword === true,
);

const blocked = await targetClient('/api/v1/dashboard/summary');
record('admin endpoints are refused until the password is changed', blocked.status === 403, `got ${blocked.status}`);
record(
  'the refusal carries its own code',
  blocked.body?.error?.code === 'PASSWORD_CHANGE_REQUIRED',
  blocked.body?.error?.code,
);

const changed = await targetClient('/api/v1/auth/change-password', post({
  currentPassword: temporaryPassword,
  newPassword: 'ChosenByTheUser789!',
}));

record('the holder can change the password', changed.status === 200, `got ${changed.status} ${JSON.stringify(changed.body?.error || '')}`);

const afterChange = await User.findByPk(target.id);
record('the forced change was cleared', afterChange.mustChangePassword === false);
record('the chosen password verifies', await bcrypt.compare('ChosenByTheUser789!', afterChange.passwordHash));

const sessionsAfterChange = await RefreshToken.count({ where: { userId: target.id, revokedAt: null } });
record('changing the password revoked every session', sessionsAfterChange === 0, `live=${sessionsAfterChange}`);

/* -------------------------------------------------------------------------- */
/* 10. A wrong current password is refused                                       */
/* -------------------------------------------------------------------------- */

const wrongCurrent = await targetClient('/api/v1/auth/change-password', post({
  currentPassword: 'NotThePassword123!',
  newPassword: 'WhateverPassword456!',
}));
record('a wrong current password is refused', wrongCurrent.status === 401, `got ${wrongCurrent.status}`);

/* -------------------------------------------------------------------------- */
/* 11. An administrator can register the Telegram username                        */
/* -------------------------------------------------------------------------- */

const registered = await makeAccount('reset.registered@virallink.test');

const register = await adminClient(`/api/v1/users/${registered.id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ telegramUsername: '@registered_person' }),
});
record('an administrator can register a Telegram username', register.status === 200, `got ${register.status}`);

const afterRegister = await User.findByPk(registered.id);
record('it is stored without the @', afterRegister.telegramUsername === 'registered_person', afterRegister.telegramUsername);

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                       */
/* -------------------------------------------------------------------------- */

// The outbox rows the test provoked, aimed at chats that do not exist.
await TelegramOutbox.destroy({ where: { chatId: { [Op.gte]: 900000000 } }, force: true });
await PasswordResetToken.destroy({ where: { userId: createdAccounts }, force: true });
await RefreshToken.destroy({ where: { userId: createdAccounts }, force: true });

/*
 * The accounts themselves are removed too.
 *
 * They are hard-deleted rather than soft-deleted: a soft-deleted account keeps
 * the unique index on its email address, so the next run of a suite that looks
 * the address up without the paranoid scope would fail on it — and a leftover
 * account is one more thing to remember to clean up by hand.
 */
await User.destroy({ where: { id: createdAccounts }, force: true });

/* -------------------------------------------------------------------------- */
/* Report                                                                        */
/* -------------------------------------------------------------------------- */

console.log('\n=== PASSWORD RECOVERY TESTS ===');
for (const result of results) {
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.name}${result.detail ? ` :: ${result.detail}` : ''}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

server.close();
await sequelize.close();
process.exit(failed ? 1 : 0);
