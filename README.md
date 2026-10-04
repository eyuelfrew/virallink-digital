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

### Build the schema and seed the roles

Nothing to do. The API applies pending migrations and seeds the RBAC baseline
(38 permissions, 4 roles, 12 financial categories, the company profile) on every
start, so the first `npm run dev:api` builds the schema from empty.

Both steps are idempotent and tracked:

- a migration runs once, then its filename is recorded in the `SequelizeMeta`
  table, so it never runs twice;
- the seeder upserts, so it never duplicates a row.

That makes `npm run migrate` and `npm run seed` optional rather than required.
They reach the same end state and still exist for production, where you apply
schema changes deliberately — see "Before deploying".

The seed contains **no fake company data** — no clients, employees,
testimonials or statistics. Everything public is entered by an administrator and
stays hidden until published.

### Create your first administrator

There is no default account. Create one:

```bash
npm run create:admin --workspace @virallink/api
```

It prompts for a name, email, role and password, so the password never lands in
shell history. Requirements: at least 12 characters mixing upper case, lower case
and a number.

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
**http://localhost:3000/admin-teftef/login**.

### Both at once

```bash
npm run dev
```

Runs both with prefixed output. Use this unless you specifically want one in
isolation.

---

## Schema changes during development

Write a migration, in `apps/api/src/migrations/`, named
`YYYYMMDDHHMMSS-description.cjs` and exporting `up(queryInterface, Sequelize)`.
Restart the API. The boot sequence applies it and records it in `SequelizeMeta`,
so there is no separate command to remember and the change is reproducible on
the server for free. Use `createTable`, `columns` and friends from
`apps/api/src/migrations/migration-helpers/` rather than hand-writing column
types — see that file for why migrations describe the schema as it was when they
were written instead of deriving it from the live models.

Check what has run:

```bash
npm run migrate:status
```

To reverse one step, `npm run migrate:undo`. Every migration has a `down()`, but
they drop whole tables, so a rollback after real data exists means restoring a
backup — see `docs/DEPLOYMENT.md`.

### DB_SYNC_ALLOWED

`.env` ships `DB_SYNC_ALLOWED=false`, and that is the default: the API does not
call `sequelize.sync()` at all, so models can never quietly alter a table.

Setting it to `true` makes the API run `sequelize.sync({ alter: true })` on every
start, which is convenient while iterating on models but can drop a column and
destroy shareholder or financial data. It is a deliberate opt-in, and
`config/env.js` terminates the process if it is true when `NODE_ENV=production`.

---

## Verifying a change

```bash
npm test                # 35 unit tests: money arithmetic + data isolation
npm run test:integration # 62 checks: public endpoints, login, RBAC, audit trail
npm run test:all        # both of the above
```

`npm run test:all` is the one that matters before a deploy. The integration
suites apply pending migrations and seed the RBAC baseline themselves, and they
create their own `*.test` accounts, so they run against an empty database and are
safe to re-run.

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

**A migration fails at boot** — the API stops rather than starting with a broken
schema, and the log names the migration and the underlying MySQL error. Fix the
migration, or undo the last one with `npm run migrate:undo`, then restart.

**`Unsafe production configuration`** — `config/env.js` refuses to boot in
production and lists every problem at once. Locally, `NODE_ENV=production` will
also flag `COOKIE_SECURE` and `SITE_URL`; those are expected on a local `.env`.

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
│     ├─ app/admin-teftef/  management console
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
- [ ] Set `AUTO_MIGRATE=false` and run `npm run migrate` once from cPanel's "Run
      NPM script". `config/env.js` refuses to boot in production otherwise,
      because Passenger can start several processes at once and concurrent
      migrations on a live database are not safe
- [ ] Generate fresh, distinct `JWT_SECRET` and `JWT_REFRESH_SECRET` on the server
- [ ] Confirm `CORS_ORIGINS` lists only your real site origin
- [ ] Submit `https://yourdomain.com/sitemap.xml` in Google Search Console

See `docs/DEPLOYMENT.md` for the cPanel walkthrough.