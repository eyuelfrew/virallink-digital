# Virallink — Telegram Console & Telegram Backend Specification

Status: **descriptive spec of the system as built** (source of truth: the code).
Scope: `/vira-admin/telegram` and its sibling Telegram surfaces in `apps/web`,
plus every Telegram-related route, service, model, migration and script in
`apps/api`.

Verified against the working tree on branch `second`, 2026-11-09. **Most of this
subsystem is currently untracked/uncommitted** — see §13.1. Where this document
conflicts with `ARCHITECTURE.md`, `docs/ADMIN_SPEC.md`, `docs/BACKEND_SPEC.md` or
`docs/DEPLOYMENT.md`, the code (and this document) is the newer truth.

Related documentation (all describe **only subsystem A**, the notification bot):

| Document | Section | What it covers |
|---|---|---|
| `docs/ADMIN_SPEC.md` | §2.12, §3, §4 | Telegram notifications, account linking, sidebar |
| `docs/BACKEND_SPEC.md` | §14, §2, §9 | Notification webhook, outbox, cron, env vars |
| `docs/DEPLOYMENT.md` | "Telegram bot", cron | BotFather setup, webhook registration, outbox cron |
| `ARCHITECTURE.md` | §9 | Deployment assumptions (now partly violated — §13.3) |

---

## 0. Handoff summary (read this first)

**What this system is.** Two distinct Telegram features share one database and one
bot token but solve different problems. `/vira-admin/telegram` is the management
console for a **Telegram auto-reply engine**: it connects bots or personal
Telegram accounts, then answers incoming private chats with welcome/away
messages, a product catalog, conditional rules and interactive button menus.
Everything else that says "Telegram" (Account → Telegram notifications, task
alerts, link codes) is the older, separate notification subsystem.

**The five facts another engineer/AI must not miss:**

1. **There are two independent inbound transports.** Bot connections receive
   Telegram `POST`s on unauthenticated webhooks; personal accounts hold a
   long-lived **MTProto client in the API process** (`teleproto@1.232.1`) with
   `NewMessage` / `CallbackQuery` event handlers. Both converge on the same
   `handleAutoReplyUpdate` / `handleIncomingAccountMessage` logic and the same
   chat state, settings, rule and catalog tables.
2. **`telegram_auto_reply_accounts` is the central row.** Provider is `env`
   (company bot from env), `custom` (token pasted in the UI) or `account`
   (personal MTProto login). Settings, rules, menu buttons and chat state all
   hang off `accountId`; **catalog is global**, not per-account.
3. **Secrets are encrypted at rest with AES-256-GCM.** `botToken`, `apiHash`,
   `phoneNumber` and `sessionString` never leave the API unencrypted and are
   never serialised to the browser. The key derives from
   `TELEGRAM_AUTO_REPLY_KEY`, falling back to `JWT_SECRET`; rotating either
   makes previously stored credentials unreadable.
4. **The API is the only security boundary.** Page-level
   `requirePermission('telegram.read')` and the sidebar are cosmetic. Most
   `/telegram-auto-reply/*` routes are **owner-scoped by session**, not
   permission-gated; only the admin-wide operations (`/accounts`, `/catalog`,
   `/company/connect`) carry `requirePermission`. See §6.1 and §13.4.
5. **The webhook secret is checked twice and compared in constant time**, in the
   URL path and in `X-Telegram-Bot-Api-Secret-Token`. Both webhook routes
   acknowledge with `{ ok: true }` *before* processing, so Telegram never
   retries and produces duplicate replies.

**Where to start in the code:**

| Concern | File |
|---|---|
| The console page | `apps/web/app/vira-admin/(protected)/telegram/page.js` |
| The whole console UI | `apps/web/components/admin/TelegramAutoReplyPanel.js` (1,399 lines) |
| Personal-account sign-in UI | `apps/web/components/admin/TelegramAccountPanel.js` |
| Menu editor UI | `apps/web/components/admin/TelegramMenuBuilder.js` |
| Notification link card | `apps/web/components/admin/TelegramLinkCard.js` |
| Public webhooks | `apps/api/src/routes/v1/telegram.routes.js` |
| Admin auto-reply router | `apps/api/src/routes/v1/telegram-auto-reply.routes.js` |
| Auto-reply engine (bot + MTProto) | `apps/api/src/services/telegram-auto-reply.service.js` (2,042 lines) |
| MTProto runtime / login | `apps/api/src/services/telegram-account.service.js` |
| Encryption | `apps/api/src/services/telegram-crypto.service.js` |
| Tables | 4 migrations in `apps/api/src/migrations/*telegram*.cjs` |
| Permissions | `packages/shared/src/permissions.js` |

---

## 1. Two Telegram subsystems (read this before changing anything)

The word "Telegram" covers two features that were built at different times and
must not be conflated.

| | **A. Task notifications** (older) | **B. Auto-reply console** (this spec) |
|---|---|---|
| Purpose | Push task-assigned / task-status-changed alerts to a linked user | Answer incoming private chats automatically |
| Transport | One **env-configured** bot (`TELEGRAM_BOT_TOKEN`) via webhook | `env` bot + `custom` bots via webhooks, **personal accounts via MTProto** |
| Identity | `users.telegram_chat_id` claimed with a one-time `/start <code>` | `telegram_auto_reply_accounts` rows, one per bot or personal login |
| Delivery | `telegram_outbox` durable queue, inline + cron drain | Direct `sendMessage` / `sendPhoto` / `sendMediaGroup` / `client.sendMessage` |
| Admin UI | `/vira-admin/account` → **Telegram notifications** card | `/vira-admin/telegram`, `/vira-admin/my-telegram` |
| API prefix | `/api/v1/auth/telegram*`, `/api/v1/telegram/webhook/:secret` | `/api/v1/telegram-auto-reply/*`, `/api/v1/telegram/auto-reply/webhook/:id/:secret` |
| Gated by | `TELEGRAM_ENABLED=true` | **Not** gated by `TELEGRAM_ENABLED` (see §13.5) |
| Tables | `users` (+6 columns), `telegram_outbox` | 7 new tables + 3 column additions |
| Docs | `ADMIN_SPEC.md` §2.12, `BACKEND_SPEC.md` §14 | **This document** |

They share: the env bot token and username, `TELEGRAM_WEBHOOK_SECRET` (for the env
webhook), `TELEGRAM_WEBHOOK_URL` (used to build custom-bot webhook URLs),
`SITE_URL` (used to make media URLs absolute), the `media` table, and the
`telegram.*` permission keys.

---

## 2. Surface map

### 2.1 Admin pages

| Route | Guard | Initial data | Component / mode |
|---|---|---|---|
| `/vira-admin/telegram` | `requirePermission('telegram.read')` (cosmetic; redirects to `/vira-admin/my-tasks` on failure) | `adminData('/telegram-auto-reply/accounts')` — **all** accounts | `TelegramAutoReplyPanel mode="admin"`, `showAccountPanel`, `canWriteCatalog = session.permissions.includes('telegram.write')` |
| `/vira-admin/my-telegram` | `requireSession()` only | `adminData('/telegram-auto-reply')` — **own** accounts only | `TelegramAutoReplyPanel mode="self"`, `showAccountPanel` |
| `/vira-admin/account` | `requireSession()` only | `session.telegram` (link state baked into the session) | `TelegramLinkCard` inside "Telegram notifications" panel |

`metadata.title` is `Telegram auto-reply`, `My Telegram`, `Account` respectively;
all live under the `(protected)` route group, so they inherit the noindex and
layout. The sidebar exposes **Settings → Telegram auto-reply**
(permission `telegram.read`) and a top-level **My Telegram** entry with
`permission: null` (any authenticated user), in
`packages/shared/src/permissions.js` and its web copy
`apps/web/shared/permissions.js`.

### 2.2 Request path

```
Browser (Client Component)
  │  fetch(browserApiUrl('/api/telegram-auto-reply/…'))  ← direct API origin
  │  https://api.virallinkdigital.com/api/v1/telegram-auto-reply/…
  │  credentials: 'include' → session cookie on .virallinkdigital.com
  ▼
Express  /api/v1/telegram-auto-reply/…            ← api.virallinkdigital.com
  │  admin.routes.js: authenticate (session)
  │  per-route requirePermission where applicable
  ▼
services → Sequelize → MySQL
```

Every client-side request follows that same path. `browserApiUrl()` in
`apps/web/lib/config.js` maps an app-relative `/api/...` path to the public API
origin, and each fetch sends `credentials: 'include'` so the session cookie is
attached across origins. That covers the Telegram link endpoints
(`/api/auth/telegram`, `/api/auth/telegram/link`) and multipart uploads from
`PhotoField` / `MultiPhotoField` as well — there are no Next.js route handlers
in the browser's request path. `/api/...` paths elsewhere in this document are
app-relative shorthand; the API serves them under `/api/v1/...`.

Telegram itself does **not** go through Next: it POSTs directly to the public API
base URL on the two unauthenticated webhook routes, which are mounted in
`routes/index.js` **before** `adminRoutes` so the auth guard never sees them.

---

## 3. `/vira-admin/telegram` — the console

### 3.1 Page component

`telegram/page.js` is a thin Server Component (21 lines):

```js
const session = await requirePermission('telegram.read');
const result = await adminData('/telegram-auto-reply/accounts');
const accounts = result.ok ? result.data || [] : [];
const canWriteCatalog = Boolean(session.permissions?.includes('telegram.write'));

<AdminHeader title="Telegram auto-reply"
  description="Connect bots and personal accounts, then configure auto-reply,
               menus, rules and catalog in tabs." />
<TelegramAutoReplyPanel mode="admin" initialAccounts={accounts}
  canWriteCatalog={canWriteCatalog} showAccountPanel />
```

`adminData()` is the server-side fetcher; failures degrade to an empty account
list rather than throwing, so the page always renders. Everything interactive is
client-side: `TelegramAutoReplyPanel` is `'use client'`.

### 3.2 Two modes, one component

`TelegramAutoReplyPanel` is shared by both pages. `mode` switches behaviour:

| Behaviour | `mode="admin"` (`/vira-admin/telegram`) | `mode="self"` (`/vira-admin/my-telegram`) |
|---|---|---|
| Accounts endpoint | `/api/telegram-auto-reply/accounts` | `/api/telegram-auto-reply` |
| Accounts visible | Every account, `owner` included in serialisation | Only `ownerUserId = session.user.id` |
| "Connect company bot" form | Shown | Hidden |
| `TelegramAccountPanel` | Shown (also in admin mode — see §13.6) | Shown |
| **Catalog tab** | Present | Absent |
| Blocked chats visible | Every account | Only the person's own accounts |

`activeTab` starts on `auto-reply` when accounts exist, otherwise `connections`.
A persistent "Working with" selector at the top picks `selectedId`; every tab
except Connections renders a "No connection selected" panel
when nothing is selected. `settingsForm` is re-derived from the selected
account's `settings` on every account/selection change.

### 3.3 Tabs

| Tab id | Label | Icon | Visible in | Purpose |
|---|---|---|---|---|
| `connections` | Connections | `Plug` | both | List/select connections, connect bots, sign in personal account |
| `auto-reply` | Auto-reply | `Settings` | both | Welcome/away/catalog settings, webhook sync, enable/disable, disconnect |
| `rules` | Reply rules | `ListChecks` | both | Conditional reply rules CRUD |
| `menu` | Chat menu | `LayoutGrid` | both | Menu settings + `TelegramMenuBuilder` |
| `catalog` | Catalog | `Package` | **admin only** | Global catalog CRUD (read-only without `telegram.write`) |

Each tab loads its own data with `cache: 'no-store'`. Errors and notices are
single global banners (`error` / `notice` state), not per-tab.

### 3.4 Connections tab

- **Account list** — one row per connection: `name (@botUsername|@accountUsername)`,
  provider badge (`Company bot` / `Bot token` / `Personal account`), and a status
  pill. Status is `connectionStatus` for `provider: 'account'`, otherwise
  `active` / `disabled` from `isActive`. Tones: connected/active green,
  `code_sent` / `password_required` warning, `error` danger.
- **Connect a bot** — token + optional name → `POST /api/telegram-auto-reply/connect`.
- **Connect company bot** (admin only) — → `POST /api/telegram-auto-reply/company/connect`
  (requires `telegram.manage`). Creates `provider: 'custom'`, `isCompany: true`,
  `ownerUserId: null`.
- **Personal Telegram account** — `TelegramAccountPanel` (see §4).

### 3.5 Auto-reply settings tab

`PUT /api/telegram-auto-reply/:id/settings` with the whole form:

| Field | Type | UI default | Notes |
|---|---|---|---|
| `isEnabled` | boolean | `true` | Master switch; both inbound handlers bail when false |
| `welcomeMessage` | text ≤ 4000 | `''` | Sent on first message of a new chat |
| `awayMessage` | text ≤ 4000 | `''` | Away auto-reply |
| `awayMode` | boolean | `false` (DB default `true`) | Enables away replies |
| `awayCooldownMinutes` | 0–1440 | `60` (DB default `360`) | Per-chat away cooldown |
| `catalogEnabled` | boolean | `true` | Send catalog on new chats / catalog intent |
| `catalogIntro` | text ≤ 1000 | `''` | Intro text above catalog |
| `menuEnabled` | boolean | `false` | Auto-open menu on new chats |
| `menuTitle` | text ≤ 300 | `''` | Falls back to "What would you like to do?" |
| `replyToNewChats` | boolean | `true` | |
| `replyToReturningChats` | boolean | `true` | |

Buttons in this tab: **Save settings**, **Sync webhook** (hidden for
`provider: 'account'`), **Enable/Disable auto-reply** (`PATCH /:id/active`), and
**Disconnect** (only for `provider: 'custom'`, with `window.confirm`). A footer
shows provider, connection/webhook status and `lastError`.

Every field carries a line of help text saying when it is actually used,
because the auto-reply is deliberately quiet and an unexplained silence reads
as a broken connection:

| Field | When it is used |
|---|---|
| `welcomeMessage` | The first time somebody writes to this connection. A chat that already exists never sees it. |
| `awayMessage` | When no rule answers and the account is away — once per chat per cooldown. |
| `awayCooldownMinutes` | How long the away message waits before it may be sent again in the same chat. |
| `catalogIntro` | Before the catalogue, when somebody asks about prices, services or products. |

**Check this connection** sits at the bottom of the tab and answers the
question the rest of the tab raises: *why was nothing sent?*

- A chat id field and a message to test — nothing a client wrote is stored, so
  the administrator supplies the message to try.
- **Preview what happens** (`GET /:id/preview?chatId=`) runs the same matcher
  and the same cooldown the handler uses and reports the outcome: which rule
  would answer, what the welcome/away/catalog message would be, or the reason
  nothing would be sent — the away cooldown, the catalogue being empty, the
  chat being blocked, auto-reply being off for that chat.
- **Let the away message answer now** (`POST /:id/reset-away`) clears the
  cooldown for that chat. The cooldown exists so a chatty visitor is not
  flooded, but it also means somebody testing the away message waits hours
  for the next one.
- **Send test message** (`POST /:id/test-message`) sends one message through
  the same transport the auto-reply uses — the Bot API for a bot, the MTProto
  session for a personal account — and reports Telegram's own refusal if there
  is one.

The preview exists because the auto-reply's silence is correct most of the
time, and without a way to ask *why* there is no way to tell a quiet bot from
a broken one.

`webhookConfigured` on the account payload says whether the server knows the
public URL a bot's webhook is registered at. A bot without one is marked
`webhookStatus: 'error'` with a message that says what to do, because "active
but hears nothing" is the failure that hides best. The **server bot**
(`provider: 'env'`) does not register its own webhook: that belongs to the
linking subsystem, which registers `TELEGRAM_WEBHOOK_URL` at boot and
forwards every update to this auto-reply. Telegram keeps one webhook per bot,
so registering a second, different URL here would take the bot away from the
route that handles linking and password recovery.

> `menuEnabled` / `menuTitle` are edited on the Menu tab but submitted by the
> same `handleSettingsSave`, which PUTs all 11 fields. Because the form is seeded
> from the selected account's settings, saving one tab does not clobber the
> other's values.

### 3.6 Reply rules tab

Form fields: `name` (required), `trigger`, `keywords`, `replyText`,
`imageMediaIds` (via `MultiPhotoField folder="telegram-rules"`), `audioMediaId`
(via `AudioField folder="telegram-audio"`), `sendCatalog`,
`showMenu`, `cooldownMinutes` (0–10080), `priority` (−1000…1000),
`stopProcessing`, `isActive`.

Trigger labels: `any` "Any message", `new_chat` "New chat", `returning_chat`
"Returning chat", `keyword` "Contains keyword", `exact` "Exact phrase", `regex`
"Regular expression". `keywords` is a comma/newline-separated textarea (or a raw
regex for `regex`). Table columns: rule, trigger, match, priority, status
(+ cooldown), actions (Edit / Delete with confirm).

Endpoints: `GET/POST /api/telegram-auto-reply/:id/rules`,
`PUT/DELETE /api/telegram-auto-reply/:id/rules/:ruleId`.

#### Audio replies

A rule may carry one audio file, sent after the reply text and the photo
album. It is the "here is our showreel" / "this is what we sound like" reply.

- The file lives in the media library (`kind = 'audio'`), so it is uploaded
  through `POST /api/v1/media` and referenced by id. The media service stores
  audio exactly as uploaded — there is no audio re-encoding — and checks the
  container signature (MP3, Ogg, WAV, MP4/M4A, FLAC, WebM, ADTS AAC) rather
  than trusting the declared type, the same way the image path checks that a
  file really decodes as an image.
- `AudioField` uploads immediately and submits the media id. Removing the file
  submits `null`, which the API treats as unlink.
- Two shapes, because Telegram has two:
  - **OGG/Opus** is sent as a **voice note** — the round bubble in the chat.
    `botApi.sendVoice` for a bot, `voiceNote: true` for a personal account.
  - **Everything else** is sent as an **audio file** with a play button.
    `botApi.sendAudio` for a bot, a plain file upload for a personal account.
- The bot transport hands Telegram a URL (`SITE_URL` + `/media/<key>`), so the
  file has to be reachable from the public internet — the same constraint the
  photo album has always had. The personal-account transport uploads the bytes
  itself, so it works from a local disk.

### 3.7 Chat menu tab

Two panels. **Menu settings** edits `menuEnabled` + `menuTitle` through the same
settings endpoint; helper text states `/menu` works even when auto-open is off.
**Chat menu buttons** renders `TelegramMenuBuilder({ accountId, menuTitle })`:

- Button form: `label` (≤ 64, required), `action`, `parentId` (only buttons whose
  action is `submenu`, excluding the one being edited), `displayOrder`, `isActive`,
  plus conditional fields — `replyText` for `text` / `submenu`, `url` for `url`,
  `MultiPhotoField folder="telegram-menu"` + caption for `album`.
- Action labels: `catalog` "Send the catalog", `text` "Send a text reply",
  `album` "Send an image album", `url` "Open a link", `submenu` "Open a submenu",
  `menu` "Return to main menu".
- **Main menu preview** renders active top-level buttons two per row with the
  menu title — "exactly as Telegram will render it".
- Table: button, action, inside (parent label), order, status, Edit/Delete.
  Deleting a parent cascades its children (FK `ON DELETE CASCADE`); the UI warns
  about this.

Endpoints: `GET/POST /api/telegram-auto-reply/:id/menu-buttons`,
`PUT/DELETE /api/telegram-auto-reply/:id/menu-buttons/:buttonId`.

### 3.8 Catalog tab (admin only)

Rendered only in admin mode. When `canWriteCatalog` is false the form is replaced
by "You can view the catalog but not edit it." and Edit/Delete buttons are
hidden — **the API independently requires `telegram.write` on all mutations**.

Form: `name` (required), `description`, `price`, `currency` (default `ETB`),
`displayOrder`, `isActive`, a single `PhotoField name="imageMediaId"
folder="telegram-catalog"`, and a `MultiPhotoField` album. With ≥ 2 album images
the item is sent as a Telegram album; the single image stays the fallback.
Table: item (name, description, album count), price + currency, status, actions.

Endpoints: `GET /api/telegram-auto-reply/catalog` (`telegram.read`),
`POST/PUT/DELETE /api/telegram-auto-reply/catalog[/:id]` (`telegram.write`).

### 3.10 Frontend component inventory

| File | Lines | Role |
|---|---|---|
| `TelegramAutoReplyPanel.js` | 1,399 | All six tabs, state, all fetches, account selector |
| `TelegramAccountPanel.js` | 472 | Personal MTProto sign-in / reconnect / reset |
| `TelegramMenuBuilder.js` | 390 | Menu button CRUD + preview |
| `TelegramLinkCard.js` | 207 | Notification link/disconnect (subsystem A) — calls `browserApiUrl('/api/auth/telegram[/link]')` directly |
| `MultiPhotoField.js` | — | Multi-image upload via `browserApiUrl('/api/media')` direct to the API, returns media ids |

`TelegramLinkCard` polls `browserApiUrl('/api/auth/telegram')` (GET, direct to the
API with the session cookie) every 5 s while a link code is outstanding and flips
to "connected" on its own; it renders a "not enabled on this server" message when
`status.configured` is false.

---

## 4. Personal Telegram account (MTProto)

A bot token can only answer messages sent *to a bot*. This subsystem lets a user
sign in **as themselves** with `api_id` / `api_hash` from my.telegram.org, a phone
number, a login code and an optional 2FA password, so auto-reply answers their
own private chats.

### 4.1 State machine

`telegram_user_accounts.status` and the mirrored
`telegram_auto_reply_accounts.connectionStatus`:

| Status | Meaning | UI |
|---|---|---|
| `disconnected` / `new` | No session | "Not connected" |
| `code_sent` | `sendCode` returned a `phoneCodeHash` | "Login code sent" — code input + Resend |
| `password_required` | Telegram signalled `SESSION_PASSWORD_NEEDED` | "2FA password required" — password input |
| `connected` | MTProto client authorised and listening | "Connected" — identity card + Disconnect / Clear session |
| `error` | Last operation failed | "Needs attention", `lastError` banner |

`getStatus()` also returns `apiId`, `apiHashSet`, `phoneNumber`, `sessionSet`,
`source`, `configured`, `connected`, `account{id,first_name,last_name,username}`,
`lastConnectedAt`, `autoReplyAccountId`, `pending_login` and a decryption `error`.
**No secret value is ever returned.**

### 4.2 Sign-in flow

1. `PUT /account/config` — validates `apiId` (positive int ≤ 999,999,999),
   `apiHash` (blank = keep stored), `phoneNumber` (`^\+?[0-9]{8,16}$`). Changed
   credentials cancel any pending login, disconnect the runtime, clear the saved
   session and reset the identity fields.
2. `POST /account/send-code` — builds a `TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 5 })`,
   connects and invokes `Api.auth.SendCode` **directly** (not the library's
   `sendCode` helper), storing the client + `phoneCodeHash` in an
   **in-memory `pendingLogins` map** with a 10-minute TTL. Returns
   `is_code_via_app`, `delivery: 'telegram_app' | 'sms' | 'call' | 'fragment' | 'email'`,
   `phone_number`, `sms_available`, `sms_requested`, `sms_sent`, `code_length`
   and `timeout`.

   Reading `sent.type` and `sent.nextType` is essential: Telegram frequently
   answers `auth.SentCodeTypeApp` with **no `nextType`**. In that case it will
   never send an SMS, no matter how many times the user presses "Send code by
   SMS"; the helper reports `sms_available: false` so the UI hides the button
   and explains that the code exists only inside the Telegram app. Body
   `{ forceSms: true }` resends via `auth.ResendCode` only when `nextType` is
   `auth.CodeTypeSms`; otherwise `sms_sent` is false and `delivery` remains the
   real channel.

   Before requesting a code it revokes any saved session on Telegram's side
   (`client.logOut()`), because `SentCodeTypeApp` delivers the code to the
   account's **other logged-in sessions**. A stale headless API session
   therefore swallows every code: the request succeeds, the UI says "sent",
   and nothing ever reaches a human. `clear-session`, `reset` and changing the
   credentials revoke the session for the same reason — nulling
   `sessionString` locally is not enough, Telegram keeps the session alive.

   Sending a code is refused while the account is already connected, so a
   stray click cannot revoke a working session.

   **QR fallback (`POST /account/qr-start`).** `startQrLogin()` calls
   `client.signInUserWithQrCode()` and stores the login attempt in the same
   `pendingLogins` map (`mode: 'qr'`, `status: 'qr_pending'`). Each token is
   turned into `tg://login?token=…` and a PNG data URL (`qrcode`) stored on the
   entry. `GET /account/status` exposes `pending_login.qr_data_url`,
   `qr_url`, `qr_expires_at` and `status`; the browser polls it, refreshes the
   image when Telegram rotates the token, and switches to `password_required`
   if 2FA is enabled. QR sign-in needs no code delivery at all, which is the
   reliable path when Telegram refuses SMS. On success `finishLogin()` saves the
   session, updates the phone number from `getMe()`, and revokes the previous
   saved session in the background so it cannot intercept later codes.
3. `POST /account/verify-code` — `Api.auth.SignIn`. On
   `SESSION_PASSWORD_NEEDED` the pending entry moves to `password_required` and
   no session is saved yet.
4. `POST /account/verify-password` — `signInWithPassword` (2FA).
5. On success `finishLogin()` saves `client.session.save()` encrypted into
   `sessionString`, calls `activateRuntime()` which attaches the two event
   handlers, reads `getMe()`, writes the identity columns, sets `status: connected`,
   registers the client in `runtimeClients`, and calls `ensurePersonalAccount()`
   to create/refresh the mirrored auto-reply row (provider `account`,
   `webhookStatus: 'active'`, `connectionStatus: 'connected'`).

Other operations: `POST /account/cancel-login`, `POST /account/connect`
(reconnect from the saved session, `checkAuthorization()`),
`POST /account/disconnect`, `DELETE /account/session` (forget session, keep
credentials), `DELETE /account/config` (**reset** — detaches the auto-reply row
by setting `userAccountId: null` rather than deleting it, so chats, settings,
catalog and rules survive; re-signing in reattaches the orphan row).

`telegramError()` maps Telegram error codes (`PHONE_CODE_INVALID`,
`PHONE_CODE_EXPIRED`, `PASSWORD_HASH_INVALID`, `FLOOD_WAIT`,
`AUTH_KEY_UNREGISTERED`, …) to human messages. All MTProto calls are wrapped in
`withTimeout()` (20 s connect/verify, 15 s session check).

### 4.3 Runtime lifecycle

- `startAllTelegramAccounts()` runs **after** the HTTP listener opens
  (`server.js`) so a slow Telegram connection never delays startup; it restores
  every row with a non-null `sessionString`. Failures are logged per account and
  set `status: 'error'`.
- `disconnectAllTelegramAccounts()` runs on graceful shutdown.
- `runtimeClients` and `pendingLogins` are **per-process Maps** — see §13.3.

---

## 5. Backend file map

| File | Role |
|---|---|
| `routes/index.js` | Mounts `/telegram` **before** `adminRoutes`; `/telegram-auto-reply` is inside the admin router |
| `routes/v1/telegram.routes.js` | Two unauthenticated webhooks (185 lines) |
| `routes/v1/telegram-auto-reply.routes.js` | All admin auto-reply endpoints (295 lines) |
| `routes/v1/auth.routes.js` | `GET/POST/DELETE /auth/telegram*` (linking) |
| `routes/v1/admin.routes.js` | `router.use(authenticate)` then `router.use('/telegram-auto-reply', …)` |
| `services/telegram-auto-reply.service.js` | Engine: accounts, settings, rules, menus, catalog, chat state, both inbound handlers, both senders |
| `services/telegram-account.service.js` | MTProto login, runtime, session restore (731 lines) |
| `services/telegram-bot-api.service.js` | Thin Bot API client for **custom** bots (`getMe`, `sendMessage`, `sendPhoto`, `sendMediaGroup`, `answerCallbackQuery`, `editMessage*`, `setMyCommands`, `setWebhook`, `deleteWebhook`, `getWebhookInfo`) |
| `services/telegram-crypto.service.js` | AES-256-GCM encrypt/decrypt, `generateWebhookSecret()` |
| `services/telegram.service.js` | **Env bot** transport (subsystem A): `isEnabled`, `deepLink`, `sendMessage`, `setWebhook`, `escapeHtml` |
| `services/telegram-link.service.js` | One-time link codes, `linkByCode`, `unlink`, `findUserByChatId` |
| `services/notifications.service.js` | `enqueueNotification`, `drainOutbox`, recipient resolution; hooks in `task.service.js` |
| `scripts/telegramWebhook.js` | CLI: `set [base]`, `delete`, default `status` |
| `scripts/telegramOutbox.js` | CLI: `drainOutbox(50)` then close DB |
| `config/env.js` | 9 `TELEGRAM_*` vars + boot-time validation |
| `shared/schemas.js`, `middleware/schemas.js` | 15 Telegram Zod schemas and the `v()` middleware map |
| `models/definitions.js`, `models/index.js` | 8 Telegram models + associations |
| `migrations/*telegram*.cjs` | 4 migrations (§7) |

Dependency: `teleproto@1.232.1` (MTProto client, `Button`, `Api`, `events`).

---

## 6. API reference

### 6.1 Envelope, errors, authorisation

- Success: `{ data: … }`; lists with pagination add
  `{ meta: { count, page, pageSize, totalPages } }` (the catalog route uses
  `count`, not `total` — the UI reads `totalPages`).
- Errors: `{ error: { code, message, details } }`; `401` missing session, `403`
  insufficient permission, `422` field-keyed validation failure, `404` not found,
  `409` conflict, `400` bad request.
- **Every** `/telegram-auto-reply/*` route is behind `authenticate` (the admin
  router's `router.use(authenticate)`), but only some carry `requirePermission`.
  Cross-account access is decided in `accountFor(request, id)`:

```js
if (canManage(request))              // has 'telegram.manage'
  return telegram.getAccount(id);     // any account
return telegram.getOwnedAccount(request.user.id, id);  // owner only → 404
```

  `getOwnedAccount` filters `ownerUserId = request.user.id`; a user without
  `telegram.manage` therefore cannot address another user's account even if they
  guess its id. Permission matrix in `packages/shared/src/permissions.js`:
  `SUPER_ADMIN` holds all, `ADMIN` holds `telegram.read/write/manage`, all other
  roles hold none — but "My Telegram" is intentionally available to everyone via
  session-only ownership scoping.

### 6.2 Public webhooks (no session)

| Method | Path | Guard | Behaviour |
|---|---|---|---|
| POST | `/api/v1/telegram/webhook/:secret` | `isEnabled()` (i.e. `TELEGRAM_ENABLED && TELEGRAM_BOT_TOKEN`); `TELEGRAM_WEBHOOK_SECRET` in path **and** `X-Telegram-Bot-Api-Secret-Token`, `crypto.timingSafeEqual` | Env bot. `/start <code>` → `linkByCode`; `/start` → auto-reply on the env account (or a welcome hint); `/help` → help text; `callback_query` → `handleAutoReplyCallback`; other text → auto-reply on the env account, else a generic "notifications bot" message. Returns 404 when disabled, 403 on secret mismatch |
| POST | `/api/v1/telegram/auto-reply/webhook/:accountId/:secret` | `accountId` positive integer; account exists; `provider === 'custom'`; account `webhookSecret` in path **and** header, constant-time | Custom-bot updates. `callback_query` → `handleAutoReplyCallback`, else `handleAutoReplyUpdate`. Logs structured fields (accountId, updateId, chatId, from, first 200 chars of text) |

Both respond `{ ok: true }` immediately and process asynchronously with a
`.catch()` that only logs — a failure never produces a Telegram retry.
`setWebhook` uses `allowed_updates: ['message', 'callback_query']` and
`drop_pending_updates: true` (custom) / `['message','callback_query']` (env).
Webhook URLs:

```
env bot      {TELEGRAM_WEBHOOK_URL}/api/v1/telegram/webhook/{TELEGRAM_WEBHOOK_SECRET}
custom bot   {TELEGRAM_WEBHOOK_URL}/api/v1/telegram/auto-reply/webhook/{account.id}/{account.webhookSecret}
```

`connectBot` / `connectCompanyBot` call `syncWebhook(..., { throwOnError: false })`,
so a missing `TELEGRAM_WEBHOOK_URL` still creates the account but leaves
`webhookStatus: 'error'` with
`lastError: "Set TELEGRAM_WEBHOOK_URL …"`. **Sync webhook** in the UI retries.

### 6.3 Auth / linking (subsystem A)

| Method | Path | Auth | Body / response |
|---|---|---|---|
| GET | `/api/v1/auth/telegram` | session | `{ configured, botUsername, linked, username, linkedAt, alertsEnabled }` — no code or chat id |
| POST | `/api/v1/auth/telegram/link` | session | `{ code, url, botUsername, expiresAt, ttlMinutes }`; 32-hex one-time code, TTL `TELEGRAM_LINK_CODE_TTL_MINUTES` |
| DELETE | `/api/v1/auth/telegram/link` | session | Clears the mapping; outbox history retained |

`linkByCode` releases any other user previously linked to the same chat id, then
sets `telegramChatId`, `telegramUsername`, `telegramLinkedAt` and clears the code.
The chat id is **never** accepted from a client.

### 6.4 Personal account (all session-only, no permission)

Base `/api/v1/telegram-auto-reply/account`.

| Method | Path | Validation | Notes |
|---|---|---|---|
| GET | `/status` | — | Full status object (§4.1) |
| PUT | `/config` | `telegramAccountConfigSchema` | Create/update credentials; blank `apiHash` keeps stored value |
| POST | `/send-code` | — | Returns merged status + `status`, `is_code_via_app`, `delivery`, `sms_available`, `sms_requested`, `sms_sent`, `code_length` |
| POST | `/qr-start` | — | Starts QR sign-in; returns status with `pending_login.qr_data_url` / `qr_url` |
| POST | `/verify-code` | `telegramAccountCodeSchema` | Merged status; `status: password_required` on 2FA |
| POST | `/verify-password` | `telegramAccountPasswordSchema` | Merged status |
| POST | `/cancel-login` | — | Drops the in-memory pending attempt |
| POST | `/connect` | — | Reconnect from saved session |
| POST | `/disconnect` | — | Disconnects runtime, sets status disconnected |
| DELETE | `/session` | — | Clears session + identity, keeps credentials |
| DELETE | `/config` | — | Reset: removes credential row, detaches auto-reply row |

Several responses merge `getStatus()` with extra keys (`saved`, `connected`,
`session_cleared`, `reset`, `is_code_via_app`). `TelegramAccountPanel` only
re-applies a response as status when it has both `status` and `configured`.

### 6.5 Accounts & connections

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/telegram-auto-reply` | session (own accounts) | `listAccounts({ userId, canManage: false })`; also calls `getOrCreateEnvAccount()` |
| GET | `/telegram-auto-reply/accounts` | `telegram.read` | All accounts, `owner {id,name,email}` included |
| POST | `/telegram-auto-reply/connect` | session (owner) | `telegramConnectSchema` (`token` ≥20 ≤200, `name?`); validates `/^\d+:[A-Za-z0-9_-]{20,}$/`, `getMe`, rejects the env bot token, rejects a bot owned by someone else; 201 |
| POST | `/telegram-auto-reply/company/connect` | `telegram.manage` | `isCompany: true`, `ownerUserId: null`; 409 if bot id already connected; 201 |
| POST | `/telegram-auto-reply/:id/sync` | owner or `telegram.manage` | `syncWebhook`; `account`/`env` providers just register commands / mark active |
| PATCH | `/telegram-auto-reply/:id/active` | owner or `telegram.manage` | `telegramActiveSchema`; disabling a custom bot deletes its webhook; re-enabling re-syncs |
| DELETE | `/telegram-auto-reply/:id` | owner or `telegram.manage` | `env` → 400 ("disable instead"), `account` → 400 ("use My Telegram"), `custom` → `deleteWebhook` then destroy (cascades) |

`serializeAccount` returns id, name, provider, userAccountId, telegramBotId,
telegramUserId, botUsername, account name fields, isCompany, isActive,
webhookStatus, connectionStatus, lastError, lastSyncedAt, lastLoginAt, nested
`settings`, timestamps — **never `botToken` or `webhookSecret`**.

### 6.6 Settings, rules, menu buttons, chat state, catalog

| Method | Path | Permission | Schema / notes |
|---|---|---|---|
| PUT | `/:id/settings` | owner or manage | `telegramSettingsSchema`, ≥1 field |
| GET | `/:id/preview?chatId=&text=` | owner or manage | What the auto-reply would do with that message: `{ plan: { kind, rule, parts, blockedBy, away }, chat, settings }`. Runs the same matcher and cooldown the handler uses; sends nothing. `text` is the message to try — nothing a client wrote is stored, so it cannot be read back |
| POST | `/:id/reset-away` | owner or manage | Clears the away-message cooldown — `{ chatId }` for one chat, or every chat of the connection when omitted |
| POST | `/:id/test-message` | owner or manage | `telegramTestMessageSchema`: `chatId`, `text`; sends through the account's own transport (Bot API or MTProto) and returns `{ sent, via, chatId }` |
| GET | `/blocked-chats?accountId=` | owner or `telegram.read` | The chats that are blocked or whose auto-reply is off. A chat id and two switches — there is no conversation to list |
| GET | `/:id/rules` | owner or manage | Ordered `priority DESC, id ASC`; images and audio attached |
| POST | `/:id/rules` | owner or manage | `telegramRuleSchema`; 201 |
| PUT | `/:id/rules/:ruleId` | owner or manage | `updateTelegramRuleSchema` |
| DELETE | `/:id/rules/:ruleId` | owner or manage | `{ id, deleted: true }` |
| GET | `/:id/menu-buttons` | owner or manage | Ordered `displayOrder ASC, id ASC` |
| POST | `/:id/menu-buttons` | owner or manage | `telegramMenuButtonSchema`; parent must exist, belong to the same account and use `submenu`; loop guarded to depth 10; action-specific validation (`url` needs http(s), `text` needs replyText, `album` needs ≥1 image); 201 |
| PUT | `/:id/menu-buttons/:buttonId` | owner or manage | `updateTelegramMenuButtonSchema`; self-parent and loops rejected |
| DELETE | `/:id/menu-buttons/:buttonId` | owner or manage | Cascades children |
| POST | `/:id/chat-switch` | owner or manage | `telegramChatSwitchSchema`: `chatId` plus `isBlocked` and/or `autoReplyEnabled`. The only per-chat control there is |
| POST | `/catalog` | `telegram.write` | `telegramCatalogSchema`; 201 |
| PUT | `/catalog/:id` | `telegram.write` | `updateTelegramCatalogSchema` |
| DELETE | `/catalog/:id` | `telegram.write` | `{ id, deleted: true }` |

Zod limits worth knowing: messages ≤ 4000 chars, `catalogIntro` ≤ 1000,
`menuTitle` ≤ 300, button `label` ≤ 64, `url` ≤ 2048, price string
`^\d{1,12}(\.\d{1,2})?$`, currency exactly 3 chars upper-cased, albums ≤ 10
media ids, `cooldownMinutes` ≤ 10080, `priority` −1000…1000,
`displayOrder` ≤ 100000, `awayCooldownMinutes` ≤ 1440.

---

## 7. Data model

```
users ──< telegram_outbox                       (subsystem A)
users ──1 telegram_user_accounts ──1 telegram_auto_reply_accounts (provider='account')
users ──< telegram_auto_reply_accounts          (owner_user_id; NULL = company)
                    │
                    ├─1  telegram_auto_reply_settings
                    ├─<  telegram_auto_reply_rules
                    ├─<  telegram_menu_buttons        (self-ref parent_id)
                    └─<  telegram_auto_reply_chat_state     (no transcript)
telegram_catalog_items  (GLOBAL — no account_id)  ──> media
```

All FKs from `telegram_auto_reply_accounts` are `ON DELETE CASCADE`;
`telegram_catalog_items.image_media_id` is `ON DELETE SET NULL`;
`telegram_menu_buttons.parent_id` is self-referencing `ON DELETE CASCADE`.
PKs are `BIGINT UNSIGNED`, all tables use `underscored: true`, soft delete is
**not** used here, and `createdAt`/`updatedAt` are present on all 8 tables.

### Migration history

| Migration | Adds |
|---|---|
| `20261018000100-add-telegram-integration.cjs` | 6 `users` columns + 2 indexes; `telegram_outbox` |
| `20261108000100-add-telegram-auto-reply.cjs` | `telegram_auto_reply_accounts`, `..._settings`, `telegram_catalog_items`, `telegram_auto_reply_conversations` (later replaced by `..._chat_state`) |
| `20261113000200-replace-conversations-with-chat-state.cjs` | `telegram_auto_reply_chat_state`; the conversation transcript is dropped and the state carried across |
| `20261109000100-add-telegram-personal-accounts.cjs` | `telegram_user_accounts`; `provider` enum widened to `'account'`; 7 account columns; `telegram_auto_reply_rules`; 3 conversation columns |
| `20261109000200-add-telegram-menus-and-albums.cjs` | `telegram_menu_buttons`; `imageMediaIds` + `showMenu` on rules; `menuEnabled`/`menuTitle` on settings; `imageMediaIds` on catalog |
| `20261113000100-add-telegram-auto-reply-audio.cjs` | `audio_media_id` on rules (FK → `media`, `ON DELETE SET NULL`); `audio` added to the `media.kind` enum |

All five are **untracked files**; they are applied idempotently at API boot via
`bootstrapDatabase` (see README) and use `migration-helpers` so camelCase column
names become snake_case and re-runs tolerate already-added columns.

### `users` (added columns, subsystem A)

`telegramChatId` BIGINT unique (nullable), `telegramUsername` VARCHAR(64),
`telegramLinkedAt` DATE, `telegramLinkCode` VARCHAR(48) indexed,
`telegramLinkCodeExpiresAt` DATE, `telegramAlertsEnabled` BOOLEAN default true.

### `telegram_outbox`

`id`, `userId?`, `chatId?`, `kind` VARCHAR(40), `payload` JSON
(`{ text, parseMode?, buttons? }`), `status` ENUM(`pending`,`sent`,`failed`),
`attempts`, `lastError`, `sentAt`, timestamps. Indexes on
`(status, createdAt)` for the drain query and on `userId`.

### `telegram_auto_reply_accounts` (the hub)

`id`, `ownerUserId?` (NULL = company), `userAccountId?` (unique, →
`telegram_user_accounts`), `name` VARCHAR(120), `provider`
ENUM(`env`,`custom`,`account`), `telegramBotId` (unique), `telegramUserId`,
`botUsername`, `accountFirstName/LastName/Username`, `botToken` TEXT
(encrypted), `webhookSecret` VARCHAR(64), `isCompany`, `isActive`,
`webhookStatus` ENUM(`pending`,`active`,`error`), `connectionStatus`
ENUM(`new`,`code_sent`,`password_required`,`connected`,`disconnected`,`error`),
`lastError` VARCHAR(500), `lastSyncedAt`, `lastLoginAt`, timestamps.

### `telegram_auto_reply_settings` (1:1)

`id`, `accountId` unique, `isEnabled`, `welcomeMessage`, `awayMessage`,
`awayMode` (DB default **true**), `awayCooldownMinutes` (DB default **360**),
`catalogEnabled`, `catalogIntro`, `menuEnabled`, `menuTitle` VARCHAR(300),
`replyToNewChats`, `replyToReturningChats`, timestamps. Created lazily by
`ensureSettings()` via `findOrCreate`.

### `telegram_auto_reply_rules`

`id`, `accountId`, `name`, `trigger` ENUM(`any`,`new_chat`,`returning_chat`,
`keyword`,`exact`,`regex`), `keywords` TEXT, `replyText` TEXT, `sendCatalog`,
`imageMediaIds` JSON, `showMenu`, `cooldownMinutes`, `priority`,
`stopProcessing` (default true), `isActive`, timestamps. Index
`(accountId, isActive, priority)` matches the matcher's query.

### `telegram_menu_buttons`

`id`, `accountId`, `parentId?` (self FK), `label` VARCHAR(64), `action`
ENUM(`catalog`,`text`,`album`,`url`,`submenu`,`menu`), `replyText` TEXT,
`url` VARCHAR(2048), `imageMediaIds` JSON, `displayOrder`, `isActive`,
timestamps. Buttons are a **flat list**; `parentId IS NULL` = main menu.

### `telegram_auto_reply_chat_state`

**This is deliberately not a conversation.** The auto-reply keeps no
transcript: nothing a client wrote, no name, no username, no title, no
counters, no history. What is kept is the little the feature needs to behave
itself.

`id`, `accountId`, `chatId` (unique per account), `lastTelegramMessageId`
(a sequence number, not content — it stops a retried webhook being answered
twice), `lastReplyAt`, `lastAwayReplyAt`, `lastRuleId`, `lastRuleReplyAt`,
`isBlocked`, `autoReplyEnabled`, timestamps. Indexes on `(accountId, chatId)`
unique and `(accountId, isBlocked)`.

One small row per chat. A studio with a hundred thousand clients holds a
hundred thousand of these and nothing readable about any of them. The
transcript columns (`lastMessageText`, `title`, `username`, `firstName`,
`lastName`, `chatType`, `messageCount`, `replyCount`, `firstMessageAt`,
`lastMessageAt`) were dropped when the table was replaced.

### `telegram_catalog_items` (global)

`id`, `name` VARCHAR(191), `description` TEXT, `price` DECIMAL(14,2),
`currency` CHAR(3) default `ETB`, `imageMediaId` → `media`,
`imageMediaIds` JSON (album), `isActive`, `displayOrder`, timestamps.
Indexes `(isActive, displayOrder)` and `(imageMediaId)`.

### `telegram_user_accounts`

`id`, `userId` unique, `apiId` INT UNSIGNED, `apiHash` / `phoneNumber` /
`sessionString` LONGTEXT (**all AES-256-GCM encrypted**), `telegramUserId`,
`accountFirstName/LastName/Username`, `status` ENUM(`disconnected`,`code_sent`,
`password_required`,`connected`,`error`), `lastError`, `lastConnectedAt`,
timestamps.

---

## 8. Inbound message processing

Both transports call the same decision tree — `handleAutoReplyUpdate` for Bot API
webhooks, `handleIncomingAccountMessage` for MTProto. Only the send functions
differ (injected via `runMatchedRules`).

1. Bail if `!account.isActive`.
2. Bot path: ignore messages from bots, non-`private` chats and messages with no
   `text`/`caption`. MTProto path: ignore outgoing messages (`message.out`),
   non-private chats and bot senders.
3. Normalise commands: `/start[ payload]` → payload or `start`; `/menu` → menu
   command; **any other `/command` is ignored**.
4. Bail if `!settings.isEnabled`.
5. `recordChatState()` - upsert by `(accountId, chatId)`; **deduplicate**
   when `message_id <= lastTelegramMessageId` (Telegram retries), handle a
   `SequelizeUniqueConstraintError` race by re-reading; increment
   `messageCount`; return `isNew`.
6. Bail if `isBlocked`, `autoReplyEnabled === false`, new chats disabled,
   returning chats disabled, or a returning chat replied to within
   `MIN_REPLY_INTERVAL_MS = 1500`.
7. **`/menu`** → render the main menu, bump `replyCount`/`lastReplyAt`, return.
8. **`matchRules()`** — active rules ordered `priority DESC, id ASC`; a rule with
   `stopProcessing` ends the list; a `cooldownMinutes > 0` rule is skipped when
   the same `lastRuleId` replied within the cooldown. Triggers: `any`, `new_chat`,
   `returning_chat`, `keyword` (case-insensitive substring over comma/newline
   keywords), `exact` (lowercased equality), `regex` (`new RegExp(pattern,'i')`,
   invalid patterns return false).
9. **If any rule matched** → `runMatchedRules()`: reply text → optional image
   album → optional catalog (with `catalogIntro`) → optional menu re-show. Update
   `replyCount`, `lastReplyAt`, `lastRuleId`, `lastRuleReplyAt`. **Return** —
   default behaviour is skipped entirely.
10. **Default behaviour**:
    - new chat: `welcomeMessage` → catalog (if `catalogEnabled`) → `awayMessage`
      (if `awayMode`);
    - returning chat whose text matches
      `CATALOG_INTENT = /(price|prices|cost|catalog|menu|product|products|service|services|offer|ዋጋ|ዝርዝር|አገልግሎት|ምርት)/i`
      (English + Amharic) and `catalogEnabled`: send catalog;
    - otherwise `awayMessage` with `awayCooldownMinutes` since
      `lastAwayReplyAt`.
    - If new and `menuEnabled`, also send the menu.
11. Bump `replyCount`, `lastReplyAt`, and `lastAwayReplyAt` when an away reply
    was sent. Every step logs structured context.

**Callback (button tap) path** — `handleAutoReplyCallback` /
`handleAccountMenuCallback`:

- Acknowledge first (`answerCallbackQuery` / `event.answer()`).
- Require `data.startsWith('menu:')`, an existing non-blocked chat with
  auto-reply on, and `settings.isEnabled`.
- `resolveMenuTarget`: `menu:home` → home; a numeric id → look up an active
  button on this account, returning `{kind:'submenu'}` for `submenu`, `home` for
  `menu`, else `{kind:'action'}`.
- Navigation (home / submenu / ← Back) **edits the original menu message**
  (`editMessageText` or `client.editMessage`), falling back to a fresh message
  when editing is refused (common for personal accounts).
- Content actions send new messages: `catalog` → active catalog items, `text` →
  `replyText`, `album` → `imageMediaIds`, `url` → the URL as text (URL buttons
  are rendered as real Telegram URL buttons, not callbacks).

`getMenuView()` is transport-neutral: title = `menuTitle` (or
"What would you like to do?") at the root, `parent.replyText || parent.label`
inside a submenu; `backTarget` is `menu:<grandparentId>` or `menu:home`;
buttons are chunked **two per row**; a "← Back" row is appended when nested.

---

## 9. Outbound rendering & delivery

| Concern | Bot API (`custom` / `env`) | MTProto (personal `account`) |
|---|---|---|
| Text | `sendMessage` with `parse_mode: 'HTML'`; text HTML-escaped by `escapeHtml` | `client.sendMessage({ message })`; **plain text**, no parse mode |
| Single photo | `sendPhoto` with caption | `client.sendFile({ file: url, caption })` |
| Album (2–10) | `sendMediaGroup`, caption on first item only | `client.sendFile({ file: [urls], caption })` |
| Inline menu | `{ inline_keyboard: rows }` via `sendMessage` / `editMessageText`; URL buttons are real URL buttons | `Button.inline` / `Button.url` with `buttons: rows`, `parseMode: false`, `linkPreview: false` |
| Callback ack | `answerCallbackQuery` | `event.answer()` |

Shared rules:

- `CATALOG_LIMIT = 12` items per catalog send; `ALBUM_LIMIT = 10` images;
  `normalizeMediaIds()` deduplicates and clamps to 10.
- `mediaUrlsFor()` resolves media ids to public URLs via
  `absoluteMediaUrl()` = `SITE_URL` + stored `/media/...` path. **`SITE_URL` must
  be publicly reachable by Telegram** or images silently fail; failures fall back
  to sending the caption as text.
- `formatPrice()` uses `Intl.NumberFormat('en-ET', { style: 'currency', currency })`
  with 2 fraction digits; null/unparseable price → "Price on request".
- `catalogCaption()` builds `<b>name</b>` + escaped description (≤700 chars) +
  bold price; the MTProto variant uses the same without HTML.
- Per-item pacing: 80 ms (bot) / 120 ms (MTProto) to stay under Telegram flood
  limits. All outbound calls are wrapped in `try/catch` that logs and falls back;
  `callApi` has a 15 s `AbortSignal.timeout` (10 s for the env bot transport).
- `setMyCommands` registers `/start` and `/menu` (plus `/help` on the env bot
  CLI) best-effort — failures are logged, never fatal.

---

## 10. Security & trust boundaries

1. **Session/RBAC.** The API is the boundary. `/telegram-auto-reply/*` requires a
   session; admin-wide reads/writes additionally require `telegram.read` /
   `telegram.write` / `telegram.manage`. Owner-scoped routes resolve the owner
   from `request.user.id`, never from a client-supplied id.
2. **Webhook secrets.** Two independent constant-time comparisons (path segment
   + `X-Telegram-Bot-Api-Secret-Token`) on both routes. `safeEqual` uses
   `crypto.timingSafeEqual` after a length check. Env webhook additionally
   requires `TELEGRAM_ENABLED`; a missing/bad secret returns 403, a disabled
   feature 404. See §13.7 for the logging caveat.
3. **Secrets at rest.** AES-256-GCM with a random 12-byte IV and auth tag, stored
   as a base64 JSON envelope `{v, iv, tag, data}`. Key =
   `sha256('telegram-auto-reply:' + (TELEGRAM_AUTO_REPLY_KEY || JWT_SECRET))`.
   Bot tokens, API hashes, phone numbers and session strings are encrypted;
   serialisers never expose them, nor `webhookSecret`.
4. **Link-code handshake.** The chat id is learned from Telegram's update, never
   supplied by the client; 128-bit code, 30-minute default TTL, cleared on use;
   re-linking releases the previous owner of that chat id.
5. **Input handling.** Zod on every admin mutation; HTML escaping on all
   user-supplied text sent through the Bot API; URL buttons restricted to
   `http(s)://`; menu parent/loop validation; regex triggers only compile with
   `'i'` (see §13.8 for ReDoS); body parser is JSON-only, 1 MB.
6. **Best-effort delivery.** Enqueue and reply failures never propagate to the
   caller; webhook handlers acknowledge before processing; no unhandled promise
   rejection can crash the API.
7. **Unauthenticated surface is minimal.** Only the two webhook POSTs and the
   public/auth/contact namespaces sit outside `authenticate`; `/media/*splat`
   is deliberately mounted before the admin router so images are readable.

---

## 11. Configuration

`apps/api/src/config/env.js` (Zod-validated at boot) and `.env.example`:

| Variable | Default | Used by |
|---|---|---|
| `TELEGRAM_ENABLED` | `false` | `isEnabled()`, env webhook, `envBotToken()`, `getOrCreateEnvAccount` |
| `TELEGRAM_BOT_TOKEN` | — | Env bot transport; **required when enabled** |
| `TELEGRAM_BOT_USERNAME` | — | `https://t.me/<username>?start=<code>` deep link; without it the UI shows `/start <code>` |
| `TELEGRAM_WEBHOOK_SECRET` | — | Env webhook path + header; **required when enabled** |
| `TELEGRAM_WEBHOOK_URL` | — | Public API base for **both** webhook URL builders; required for custom bots to sync |
| `TELEGRAM_ANNOUNCE_CHAT_ID` | — | Declared in env + `.env.example`; **unused in code** (§13.9) |
| `TELEGRAM_LINK_CODE_TTL_MINUTES` | `30` | Link-code expiry |
| `TELEGRAM_AUTO_REPLY_KEY` | falls back to `JWT_SECRET` | AES-256-GCM key material; **set once and keep stable** |

Boot validation fails fast when `TELEGRAM_ENABLED=true` without
`TELEGRAM_BOT_TOKEN` or `TELEGRAM_WEBHOOK_SECRET`. Two non-`TELEGRAM_*` vars also
matter: `SITE_URL` (absolute media URLs, §9) and `JWT_SECRET` (encryption
fallback). Custom-bot webhooks and personal accounts work even with
`TELEGRAM_ENABLED=false` (§13.5).

---

## 12. Boot, lifecycle, cron, deployment

- **Boot** (`server.js`): `bootstrapDatabase()` applies migrations/seeds
  idempotently, then the HTTP listener opens, then
  `startAllTelegramAccounts()` restores every saved MTProto session in the
  background. Its comment explicitly says this ordering keeps a slow Telegram
  connection from delaying HTTP startup.
- **Shutdown**: `disconnectAllTelegramAccounts()` → `server.close()` →
  `sequelize.close()`, with a 10 s forced-exit timer.
- **Webhook registration**: `node src/scripts/telegramWebhook.js set [base]` uses
  `TELEGRAM_WEBHOOK_URL`, registers `/start`, `/menu`, `/help`, then prints
  `getWebhookInfo()`. `status` (default) and `delete` are also supported.
- **Outbox cron** (subsystem A): `*/5 * * * * node src/scripts/telegramOutbox.js`
  (DEPLOYMENT.md). Delivery is also attempted inline on enqueue; retries live on
  the rows. `drainOutbox(50)` marks `sent` only after Telegram accepts.
- **Docs**: `DEPLOYMENT.md` §"Telegram bot (optional)" covers BotFather, env
  secrets, webhook registration and "Account → Telegram notifications". It does
  **not** cover `TELEGRAM_WEBHOOK_URL` for custom bots, MTProto/my.telegram.org,
  `TELEGRAM_AUTO_REPLY_KEY`, or the auto-reply console.
- **cPanel reality**: two Passenger Node apps, browsers call the public API
  origin (`https://api.virallinkdigital.com`) directly while Server Components
  may use `API_INTERNAL_URL` for server-side rendering, HTTPS required for
  Telegram to reach the webhook, no Redis. Cron is the only scheduler.

---

## 13. Gaps, drift & risks (as built)

These are observed discrepancies, not recommendations already implemented. They
are the highest-value things to fix or decide on next.

### 13.1 Most of this code is uncommitted
`git status` on branch `second` shows the following as **untracked**: all 3 new
migrations, `telegram-auto-reply.routes.js`, 5 new services
(`telegram-account`, `telegram-auto-reply`, `telegram-bot-api`,
`telegram-crypto`, plus `telegram.service.js` is modified), both new admin pages,
4 new web components, `MultiPhotoField.js`, and `docs/BACKEND_SPEC.md`.
`ADMIN_SPEC.md` was "verified against the working tree at commit `f674746`
including the uncommitted Telegram … changes" — that verification predates the
Nov 8/9 work. **None of §3–§9 of this document is in any committed spec.**

### 13.2 Docs reference npm scripts that do not exist
`docs/DEPLOYMENT.md:523-524` says `npm run telegram:webhook -- set` /
`npm run telegram:webhook`; `docs/ADMIN_SPEC.md:541` says
`npm run telegram:outbox`. **No `telegram:*` script exists** in the root
`package.json`, `apps/api/package.json` or `apps/web/package.json`. The real
commands are `node src/scripts/telegramWebhook.js set` and
`node src/scripts/telegramOutbox.js` (the DEPLOYMENT.md cron line does use the
direct `node` form). Either add the scripts or correct the docs.

### 13.3 "No long-running process" is no longer true
`ARCHITECTURE.md` §9 and `BACKEND_SPEC.md` §14 state there is no long-running
bot process on the deployment target. Personal accounts now hold persistent
`TelegramClient` connections in `runtimeClients` (in-process `Map`), with
`pendingLogins` also in memory. Consequences on cPanel/Passenger:

- A Passenger restart loses pending logins (10-minute TTL anyway) and all
  runtimes; sessions are restored at boot from `sessionString`, but only after
  the DB is up and only for rows with a saved session.
- Running **more than one API process** would split the runtime maps — a chat
  would be answered by whichever process holds that client, and a restart on one
  instance would not be visible to another. No Redis/coordination layer exists.
- The `ADMIN_SPEC.md` "single-process assumptions" limitation now covers
  Telegram runtimes too and should be extended.

### 13.4 Permission model is partly inconsistent
- `canRead()` in `telegram-auto-reply.routes.js` is **defined but never used**
  (dead code).
- In `GET /blocked-chats`, the local variable `canManage` is derived from
  `TELEGRAM_READ`, not `TELEGRAM_MANAGE` — so a user with only `telegram.read`
  can list **all** blocked chats, while the same user cannot list
  all accounts (that needs `telegram.read` on `/accounts`, which is consistent,
  but the naming and the `accountFor()` semantics disagree).
- Most per-account routes are session-only with owner scoping and have **no
  `requirePermission` at all**. This is a deliberate design ("every account
  holder may configure their own chats", per the route comment), but it means
  the three `telegram.*` permissions protect only `/accounts`, `/catalog` and
  `/company/connect`. Document this explicitly before adding new routes.
- `showAccountPanel` is passed in **admin** mode too, so `/vira-admin/telegram`
  mixes a company-wide console with a panel that signs in *the current admin's
  own* personal Telegram account (§3.4).

### 13.5 `TELEGRAM_ENABLED` does not gate the auto-reply subsystem
The env-bot webhook (`/telegram/webhook/:secret`) returns 404 when
`TELEGRAM_ENABLED=false`, and `getOrCreateEnvAccount()` returns `null` without a
token, so no `env` account row is created. But the **custom-bot webhook does not
check `TELEGRAM_ENABLED`** — only the per-account secret — and personal accounts
work regardless. Auto-reply therefore functions with the "feature flag" off,
provided `TELEGRAM_WEBHOOK_URL` is set. Decide whether that is intended; if the
flag is meant to be global, add the check to the second webhook.

### 13.6 Catalog is global but presented as per-connection
`telegram_catalog_items` has no `accountId`. Every account shares one catalog,
yet the Catalog tab lives inside a page organised around a selected connection,
is admin-only, and the self-service page cannot edit it even though its rules and
menu buttons can *send* it. A `telegram.read`-less user can still trigger catalog
delivery through a rule. Either make the scope explicit in the UI or add an
`accountId`.

### 13.7 Webhook secrets may be written to logs
`telegram.routes.js` says the secret is in the path "so it never appears in
application logs as a query string". But `pino-http` logs `req.url` by default,
and `config/logger.js` redacts headers, `password`/`token` fields and
`body.token` — **not `req.url`**. The secret is therefore likely present in
request logs for both webhook paths. Fix by redacting `req.url` (or the webhook
path patterns) or by moving to a header-only secret.

### 13.8 Admin-supplied regex is compiled without limits
`ruleMatches()` runs `new RegExp(pattern, 'i')` on an admin-authored pattern
against incoming chat text. A catastrophic-backtracking pattern can block the
event loop on every incoming message. Invalid patterns safely return false, but
there is no complexity/timeout guard.

### 13.9 Smaller drift
- `TELEGRAM_ANNOUNCE_CHAT_ID` is declared in `env.js` and `.env.example` and
  listed in `BACKEND_SPEC.md`, but is **not read anywhere in code**.
- Migration DB defaults (`awayMode: true`, `awayCooldownMinutes: 360`) differ
  from the UI's `defaultSettingsForm()` defaults (`false`, `60`). The UI only
  uses its defaults when no settings row exists; since `ensureSettings()` creates
  the row with DB defaults, the DB wins — but the split is confusing.
- `BACKEND_SPEC.md` §14 lists only one webhook and says "No long-running bot
  process"; the config table (§2) omits `TELEGRAM_AUTO_REPLY_KEY` entirely.
- `DEPLOYMENT.md` §"Telegram bot" step 3 registers the **env** webhook; there is
  no equivalent runbook for `TELEGRAM_WEBHOOK_URL` on custom bots or for
  restoring personal-account sessions after a Passenger restart.
- `serializeAccount` includes `userAccountId` and `telegramUserId` but not
  `webhookSecret`/`botToken` — correct, but worth keeping in mind for any new
  serializer.
- `linkStatus` exposes `configured`/`botUsername` but no code; the `code` is
  returned only by `POST /auth/telegram/link` and is intentionally short-lived.

---

## 14. Quick verification checklist

| Check | Command / location |
|---|---|
| API boots with Telegram vars | `npm run dev:api`, watch for `personal telegram sessions restored` |
| Health | `curl http://127.0.0.1:4000/health` |
| Page guards | `/vira-admin/telegram` as a non-`telegram.read` user → redirect to `/vira-admin/my-tasks` |
| All accounts | `GET /api/v1/telegram-auto-reply/accounts` (session + `telegram.read`) |
| Custom bot webhook | Connect a bot → check `webhookStatus: 'active'` and `getWebhookInfo` via `node src/scripts/telegramWebhook.js` (note: that script inspects the **env** bot) |
| Bot reply | Send a private message; look for `telegram auto-reply (bot) incoming message` / `handled` log lines |
| Menu | `/menu` and button taps; check `menu callback handled` logs |
| Personal account | My Telegram → credentials → send code → verify → `connected`; restart API, confirm session restore |
| Notifications | Account → Connect Telegram → `/start <code>` in the bot; `GET /api/v1/auth/telegram` → `linked: true` |
| Outbox | `SELECT * FROM telegram_outbox ORDER BY created_at DESC` and `node src/scripts/telegramOutbox.js` |
| Encryption | Change `TELEGRAM_AUTO_REPLY_KEY` and confirm the UI asks for credentials again rather than showing a decryption error silently |

---

*Source of truth: the working tree, branch `second`, 2026-11-09. This document
is descriptive, not a proposal; every path, endpoint, enum and default above was
read from the code.*
