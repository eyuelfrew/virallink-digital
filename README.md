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

# 2. Create your local environment file
copy .env.example .env          # Windows
# cp .env.example .env          # macOS / Linux

# 3. Generate two DIFFERENT secrets and paste them into .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

The first goes in `JWT_SECRET`, the second in `JWT_REFRESH_SECRET`. They must
not match — the API refuses to start in production if they do.

### Point the app at your database

In `.env`, set the `DB_*` values. For WampServer with a passwordless `root`:

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

There is nothing to run. The first `npm run dev:api` creates all 41 tables, applies
the 11 migrations and seeds 44 permissions, 4 roles, 12 financial categories and
the company profile — then does nothing on every boot after that.

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

### Both at once

```bash
npm run dev
```

Runs both with prefixed output. Use this unless you specifically want one in
isolation.

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
node apps/api/test/smoke.js    # every public endpoint, auth guards
node apps/api/test/auth.js     # login, RBAC, data isolation, audit trail
```

The `auth.js` suite is the important one. It asserts the negative claims: that a
public response cannot contain employee emails, client contact details,
shareholder records or financial figures, and that a FINANCE role cannot reach
content endpoints or an EDITOR cannot reach finance.

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
│  │  └─ test/
│  └─ web/                  Next.js 16 App Router, JavaScript
│     ├─ app/(public)/      public pages
│     ├─ app/vira-admin/  management console
│     ├─ app/api/           proxy + contact form route handlers
│     ├─ components/
│     └─ lib/               api, seo, auth, sanitize, utils
├─ packages/shared/         enums, permissions, zod schemas, seo + money helpers
└─ storage/media/           uploaded images (gitignored)
```

---

## Before deploying

- [ ] Replace `apps/web/public/brand/` logo assets — the source file is 96×58px
      and will look soft on a high-density display
- [ ] Review `/privacy` and `/terms` against Ethiopian data protection and
      consumer law
- [ ] Set `NODE_ENV=production`, `DB_SYNC_ALLOWED=false`, `COOKIE_SECURE=true`
- [ ] Generate fresh, distinct `JWT_SECRET` and `JWT_REFRESH_SECRET` on the server
- [ ] Confirm `CORS_ORIGINS` lists only your real site origin
- [ ] Submit `https://yourdomain.com/sitemap.xml` in Google Search Console

See `docs/DEPLOYMENT.md` for the cPanel walkthrough.