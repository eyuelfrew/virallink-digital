# Virallink — Local Development

Two processes: the API (Express + MySQL) and the web app (Next.js). You start
them; this document has the commands.

---

## Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | 20.9+ | 20 or 22 LTS recommended for cPanel compatibility |
| MySQL | 8.0+ | WampServer, MAMP, or a cPanel database |
| npm | 10+ | ships with Node |

---

## First-time setup

```bash
# 1. Install every workspace's dependencies
npm install

# 2. Create one .env per app — each app loads its own and is independent
cp apps/api/.env.example apps/api/.env          # Windows: copy
cp apps/web/.env.example apps/web/.env           # Windows: copy

# 3. Generate two DIFFERENT secrets and paste them into apps/api/.env
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

The first goes in `JWT_SECRET`, the second in `JWT_REFRESH_SECRET`. They must
not match — the API refuses to start in production if they do.

### Point the API at your database

In `apps/api/.env`, set the `DB_*` values. For WampServer with a passwordless `root`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=virallink
DB_USER=root
DB_PASSWORD=
```

Use `localhost`, not `127.0.0.1`. MySQL treats them as different accounts and a
connection to `127.0.0.1` can be refused even when `localhost` is permitted.

Create the database once:

```sql
CREATE DATABASE virallink CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### The schema and the roles build themselves

There is nothing to run. The first `npm run dev:api` creates the tables, applies
all pending migrations and seeds the RBAC baseline — 49 permissions, 15 roles,
12 financial categories and the company profile — then does nothing on every boot
after that.

Both steps are idempotent, which is what makes that safe:

- a migration runs once, then is recorded in the `SequelizeMeta` table;
- the seeder upserts, so re-running updates rows rather than duplicating them.

This is a consequence of the deployment target rather than a preference. On cPanel
the only thing that can be started is the Node.js application, so there is no shell
to run a migration from. Deploying therefore has to be a single action.

The seeder contains **no fake company data** — no clients, employees,
testimonials or statistics. Everything public is entered by an administrator and
stays hidden until published.

`npm run migrate` and `npm run seed` still exist and reach the same end state.
They are a developer convenience, not a deployment step.

### Create your first administrator

On a fresh install, open <http://localhost:3000/vira-admin/login> — the page
offers **first-time setup** instead of the sign-in form. Enter a name, email and
password, and the account is created with the SUPER_ADMIN role. The option
disappears permanently once an account exists; the API refuses the request, so it
cannot be reached by typing the URL.

Requirements: at least 12 characters mixing upper case, lower case and a number.

If you have a shell, `npm run create:admin --workspace @virallink/api` does the
same thing and also prompts for a role, so the password never lands in shell
history.

---

## Running it

Two terminals.

**Terminal 1 — the API**

```bash
npm run dev:api
```

Listens on `http://127.0.0.1:4000`. Check it:

```bash
curl http://127.0.0.1:4000/health
```

**Terminal 2 — the website**

```bash
npm run dev:web
```

Listens on `http://localhost:3000`. Sign in at
**http://localhost:3000/vira-admin/login**.

Both processes run independently and take their config from `apps/api/.env` and
`apps/web/.env`. There is no single command that starts both; use two terminals.

The web app keeps dev and production config in separate files:

| File | Used by | API origin |
| --- | --- | --- |
| `apps/web/.env.development.local` (gitignored) | `npm run dev:web` | `http://localhost:4000` |
| `apps/web/.env.production` (committed) | `npm run build` and `next start` | `https://api.virallinkdigital.com` |

This split matters: Next.js loads `.env.local` **in both modes**, and it outranks
`.env.production` during a build. Keeping the localhost values in
`.env.development.local` instead means a plain `npm run build:web` always bakes in
the production origin. Setting the three variables in the shell still works as an
extra override; see `docs/DEPLOYMENT.md`. The API omits the `Domain` attribute on
cookies when `SITE_URL` is a localhost URL, so the browser will store them here.

### Both at once

Use two terminals (one `npm run dev:api`, one `npm run dev:web`). The repo
no longer ships a combined `npm run dev`; the apps are independent processes.

---

## Schema changes during development

Write a migration in `apps/api/src/migrations/`, named
`YYYYMMDDHHMMSS-description.cjs` and exporting `up(queryInterface, Sequelize)`.
Restart the API. The boot sequence applies it and records it in `SequelizeMeta`,
so there is no separate command to remember and the change is reproducible on the
server for free — which is what makes deploying a single action.

Use `createTable`, `addColumns`, `addIndex`, `columns` and friends from
`apps/api/src/migration-helpers/` rather than calling `queryInterface` directly.
Two reasons, both learned the hard way:

- the helpers convert `camelCase` to `snake_case`, so a migration reads like the
  models. Writing `queryInterface.addColumn` directly creates a column literally
  named `shootDate` while the model looks for `shoot_date`, and every query then
  fails with "Unknown column";
- `addColumns` tolerates a column that already exists. MySQL commits DDL
  implicitly, so a migration that fails partway is **not** rolled back — its
  earlier statements stay behind with no `SequelizeMeta` row, and the next boot
  dies on "Duplicate column". With the helper, fixing the migration and
  restarting is the whole recovery.

`DB_SYNC_ALLOWED` is `false` by default and the API never calls
`sequelize.sync()`. Setting it to `true` runs `sync({ alter: true })` on every
start, which is convenient while iterating on models but can drop a column and
destroy shareholder or financial data. It is a deliberate opt-in, and
`config/env.js` terminates the process if it is true when `NODE_ENV=production`.

---

## Verifying a change

```bash
npm test           # money arithmetic + public data isolation
npm run test:integration --workspace @virallink/api   # every endpoint, auth guards, RBAC
```

The integration runner executes four suites — `smoke`, `auth`,
`password-reset` and `employee-link` — each in its own process against a live
database.

That database is **not** the development one. The suites create employees,
clients, services, projects and tasks to exercise the RBAC rules, and they do
not remove everything they make, so running them against the development
database would fill the admin screens with fixture rows ("Search Person",
"Editor Project", "Paid Advertising") and reset the password of the
`admin@virallink.test` account. They therefore run against `virallink_test`,
created on demand by `npm run db:test:prepare --workspace @virallink/api`
(migrations applied, RBAC baseline seeded). Set `TEST_DB_NAME` in `.env` to
change it; the runner refuses to start if it points at the development
database.

The `auth` suite is the important one. It asserts the negative claims: that a
public response cannot contain employee emails, client contact details,
shareholder records or financial figures, and that a FINANCE role cannot reach
content endpoints or an EDITOR cannot reach finance.

The `password-reset` suite covers the other negative claims that matter for
account recovery: that requesting a reset code answers identically whether or
not the address has an account, that a wrong code is refused without saying
which part was wrong, that every wrong guess is charged against the code, and
that a reset revokes every session and clears a lockout.

---

## Forgotten passwords

Two routes, because they cover different people.

**Self-service, over Telegram.** The sign-in page links to
`/vira-admin/forgot-password`. A six-digit code is delivered over Telegram and
redeemed in the browser to set a new password. The code is short-lived and
single-use, and it is stored hashed, so a copy of the database does not hand
out working reset codes.

A bot cannot message a chat that has never spoken to it, so there are two ways
the code reaches you:

- **You have already linked Telegram.** The code goes straight to your linked
  chat.
- **You have not.** You get a link instead. Opening it starts the bot, and the
  bot replies with the code. The bot sends a *working* code only to a chat
  whose `@username` matches the one on your account, so knowing a colleague's
  email address is not enough to take over their account — you also have to
  control the Telegram account registered for it.

The username is registered by an administrator, from the Users screen, once they
have seen the person's Telegram. That registration is the trust anchor for
recovery.

**Administrator-assisted.** A Super Admin can issue a password from
Settings → Users → Reset password. The API generates it rather than accepting
one, so the strength of it does not depend on how rushed the person handing
it over is. The account is then required to choose a password of its own at
the next sign-in — the console refuses every other page until it does, and
the API enforces that independently of the interface.

Both routes clear a lockout. That matters more than it sounds: the lockout is
checked before the password is, so an account locked out by repeated failed
attempts cannot sign in with a freshly reset password until the lock expires
on its own.

### The webhook has to be alive

Everything above needs the bot to be able to reach the API, and Telegram needs
to be able to reach the bot. If the webhook is down, the bot hears nothing:
accounts cannot be linked, and no code is ever delivered. It fails silently —
nothing in the application logs says so.

Two things guard against that:

```bash
# after any restart, or after the tunnel changes
npm run telegram:webhook --status --workspace @virallink/api

# register it (the URL must be reachable from the public internet)
npm run telegram:webhook -- set https://api.virallinkdigital.com --workspace @virallink/api
```

The API also checks the webhook on every boot, logs a warning when Telegram
cannot reach it, and **re-registers it when the registered URL does not match
`TELEGRAM_WEBHOOK_URL`**. That is deliberate: a deploy that leaves the bot
pointed at a previous URL, or at a tunnel that has stopped, is the usual reason
this breaks without anybody noticing.

If you develop against a tunnel — a Cloudflare quick tunnel, `ngrok`, or
similar — the URL changes every time the tunnel restarts. Set
`TELEGRAM_WEBHOOK_URL` to the tunnel's current URL and restart the API, and it
will re-register itself.

### Testing it without a public address

A bot can only message a chat it has heard from, and it can only hear from
Telegram if Telegram can reach it. On a development machine with no domain
that is a loop with no obvious way round it. There is one:

```bash
npm run telegram:chatid --workspace @virallink/api
```

It removes the webhook so Telegram queues updates instead of delivering them,
waits for you to send the bot a message, and prints the chat id and username
from it. Put the chat id in the account's **Telegram chat id** field
(Settings → Users → edit) and the bot can deliver to that person directly —
which is all a password-reset code needs. No public URL, no webhook, no
tunnel.

The script puts the webhook back when it finishes. If it cannot, it says so
and explains the state it has left the bot in.

---

## Common problems

**`Database connection failed`** — check `DB_HOST` is `localhost` (not
`127.0.0.1`), the database exists, and the user can reach it.

**`Invalid environment configuration`** — the API lists the exact variable names
that are missing. This is deliberate; it fails at boot rather than 500ing later.

**`EADDRINUSE`** — something already holds the port. Change `PORT` in `.env`, or
find and stop the other process.

**Pages load but show empty states** — expected on a fresh install. Nothing
appears publicly until an administrator publishes it. Add content in the admin
dashboard and publish it.

**`Error: Model is not paranoid`** — a model was given `deletedAt` without
`paranoid: true`. Check the definition in `apps/api/src/models/definitions.js`.

**Stale admin session** — restart the API after changing `JWT_SECRET`; existing
tokens stop validating.

---

## Project layout

```
virallink/
├─ apps/
│  ├─ api/                  Express 5 + Sequelize 6 + MySQL
│  │  ├─ config/            env, database, logger, storage drivers
│  │  ├─ models/            definitions + associations
│  │  ├─ migrations/        .cjs (the CLI runs CommonJS)
│  │  ├─ seeders/
│  │  ├─ routes/v1/         auth, public, contact, admin
│  │  ├─ services/          business logic
│  │  ├─ serializers/       public.js — the privacy boundary
│  │  ├─ middleware/        auth, rbac, validate, audit, error
│  │  ├─ test/
│  │  └─ uploads/            uploaded images (gitignored; created on first upload)
│  └─ web/                  Next.js 16 App Router, JavaScript
│     ├─ app/(public)/      public pages
│     ├─ app/vira-admin/  management console
│     ├─ components/
│     └─ lib/               config (browserApiUrl), api, seo, auth, sanitize, utils
└─ packages/shared/         enums, permissions, zod schemas, seo + money helpers
```

Browser code calls the API directly at
`https://api.virallinkdigital.com/api/v1/...` through `browserApiUrl()` in
`apps/web/lib/config.js`, with `credentials: 'include'` so the session cookie on
`virallinkdigital.com` is sent. There are no Next.js `/api` route handlers.
Server Components use `API_INTERNAL_URL` for server-side rendering only.

---

## Before deploying

- [ ] Replace `apps/web/public/brand/` logo assets — the source file is 96×58px
      and will look soft on a high-density display
- [ ] Review `/privacy` and `/terms` against Ethiopian data protection and
      consumer law
- [ ] Set `NODE_ENV=production`, `DB_SYNC_ALLOWED=false`, `COOKIE_SECURE=true`
- [ ] Generate fresh, distinct `JWT_SECRET` and `JWT_REFRESH_SECRET` on the server
- [ ] Confirm `CORS_ORIGINS` includes `https://virallinkdigital.com` (and only
      your real site origins) and `COOKIE_DOMAIN=virallinkdigital.com` so the
      session cookie is sent on direct browser → API calls
- [ ] Submit `https://virallinkdigital.com/sitemap.xml` in Google Search Console

See `docs/DEPLOYMENT.md` for the cPanel walkthrough.