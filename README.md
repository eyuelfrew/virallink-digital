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

```bash
npm run migrate     # creates 36 tables
npm run seed         # 38 permissions, 4 roles, financial categories
```

`npm run seed` is the only seeder that runs in production. It contains **no fake
company data** — no clients, employees, testimonials or statistics. Everything
public is entered by an administrator and stays hidden until published.

### Create your first administrator

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

`.env` has `DB_SYNC_ALLOWED=true`, so the API runs `sequelize.sync({ alter: true })`
on every start. Edit a model, restart the API, and the table follows. You never
write a migration for a local field tweak.

**This is development only.** `config/env.js` terminates the process if
`DB_SYNC_ALLOWED` is true when `NODE_ENV=production`, because `alter: true` can
drop a column and destroy shareholder or financial data. Production applies
schema changes with `npm run migrate`.

When you finish a feature, write a real migration so the change is reproducible
on the server — see `apps/api/src/migrations/`.

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
- [ ] Generate fresh, distinct `JWT_SECRET` and `JWT_REFRESH_SECRET` on the server
- [ ] Confirm `CORS_ORIGINS` lists only your real site origin
- [ ] Submit `https://yourdomain.com/sitemap.xml` in Google Search Console

See `docs/DEPLOYMENT.md` for the cPanel walkthrough.