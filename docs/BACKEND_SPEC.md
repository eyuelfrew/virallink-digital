# Virallink — Backend Specification (as built)

Status: descriptive specification of the backend **as implemented** in `apps/api`.
Source of truth is the code; this document explains the contract and the reasoning
behind it.

Companion documents:

| Document | Covers |
|---|---|
| `ARCHITECTURE.md` | Phase-0 proposal, design system, cPanel constraints |
| `docs/ADMIN_SPEC.md` | Admin console UI and the admin-facing API in depth |
| `docs/DEPLOYMENT.md` | cPanel/Passenger deployment runbook |
| `docs/BACKEND_SPEC.md` | This file — the complete HTTP API, data model, and runtime |

---

## 0. Handoff summary

1. **One API, three trust zones.** `/api/v1/public/*` is anonymous and
   allowlist-serialised. `/api/v1/contact` is the only anonymous content write;
   the auth flows (setup/login/refresh/logout) are the other unauthenticated
   writes. Everything else requires a session and a per-route permission.
2. **The API is the only security boundary.** The web app's route-guard middleware
   cookie check and hidden navigation are usability measures. Every admin route
   independently enforces authentication and RBAC.
3. **Public and private data are physically separated.** Public reads use their
   own queries and an explicit serialiser allowlist. Shareholders, employee
   contact details, finance, tasks and activity logs have no public route.
4. **The database bootstraps itself.** On boot the API applies pending migrations
   and upserts the RBAC/reference seed behind a MySQL advisory lock, then starts
   listening. There is no separate manual migrate step on cPanel.
5. **State is process-local where shared infrastructure is unavailable.** Cache,
   rate limiting and the access-token blocklist are in-memory. The database is the
   only cross-process source of truth (refresh tokens, audit log, Telegram outbox).

---

## 1. Runtime topology

```
Browser
  | HTTPS (cPanel AutoSSL)
  |  browser fetch() direct to API with cookies (credentials: include)
  v
Apache / LiteSpeed (Passenger)
  |-- https://virallinkdigital.com ─► Node app 1: apps/web   Next.js 16, Server Components
  |                                    (server-to-server reads; no browser API route handlers)
  |
  |-- https://api.virallinkdigital.com ─► Node app 2: apps/api   Express 5,
  |                                        bound to 127.0.0.1:4000 (Passenger forwards internally)
                                |
                                v
                          MySQL 8 (Sequelize 6)
```

- The API binds to `API_HOST` (default `127.0.0.1`) and `PORT` (default `4000`)
  and is reached by browsers through its public subdomain
  `https://api.virallinkdigital.com` (Passenger forwards to loopback internally).
  Browser calls use `browserApiUrl()` with `credentials: 'include'`; cookies are
  set on the parent domain via `COOKIE_DOMAIN=virallinkdigital.com` and
  `COOKIE_SECURE=true`.
- `GET /api/v1/media/*` is reached via a Next.js `/media/*` REDIRECT to the public
  API URL (`NEXT_PUBLIC_API_PUBLIC_URL`), so the browser fetches the file directly.
- Media files live outside the document root (`MEDIA_ROOT`) or in S3-compatible
  object storage. Only keys and metadata are stored in MySQL.
- No Redis, no Docker, no PM2. Scheduling is cPanel cron.

---

## 2. Stack and versions

| Concern | Choice |
|---|---|
| Runtime | Node.js >= 20.9, ESM (`"type": "module"`) |
| HTTP | Express 5.2.1 |
| ORM | Sequelize 6.37.8 |
| Database | MySQL 8 (MariaDB supported via `DB_DIALECT`) |
| Validation | Zod 4.6.5 |
| Auth | `jose` 6.2.12 (HS256 JWT), `bcrypt` 6.0.0 (cost 12) |
| Security | `helmet` 8.3.0, `cors`, `express-rate-limit` 8.7.0 |
| Media | `multer` 2.4.0 (memory storage), `sharp` 0.35.5 |
| Storage | local disk or `@aws-sdk/client-s3` |
| Logging | `pino` 10.3.1 + `pino-http` |
| IDs / tokens | `nanoid`, `node:crypto` |

JavaScript only. No TypeScript, no build step for the API
(`npm run build` is a no-op message).

---

## 3. Boot lifecycle

Entry point: `apps/api/src/server.js`.

1. **Load `.env`** — searched in this order: monorepo root, `apps/api/.env`,
   process cwd. The first existing file wins and its path is recorded.
2. **Validate configuration** (`config/env.js`) — Zod parses every variable.
   A missing or malformed value prints the field name and exits non-zero. In
   production it also refuses to boot on insecure combinations (see §4).
3. **Assert the database connection** — `assertDatabaseConnection()`. If the
   database does not exist it attempts a one-off `CREATE DATABASE`, then retries;
   on cPanel this is usually denied and the resulting error names the MySQL panel
   as the fix.
4. **Bootstrap the schema and reference data** — `bootstrapDatabase()`:
   - waits on a MySQL advisory lock (`virallink_schema_migrate_<db>`), acquired on
     a pinned single connection;
   - applies every migration not recorded in `SequelizeMeta`, in filename order;
   - runs every seeder (RBAC permissions/roles/grants, financial categories,
     company profile) with upserts;
   - a second Passenger worker that cannot get the lock skips the whole bootstrap.
5. **Development-only sync** — `syncSchema()` runs `sequelize.sync({ alter: true })`
   only when `DB_SYNC_ALLOWED=true`; impossible in production.
6. **Listen** — `app.listen(PORT, API_HOST)`; header/request/keep-alive timeouts
   are tightened for shared hosting.
7. **Housekeeping interval (hourly)** — prune expired refresh tokens and expired
   access-token blocklist entries. Timer is `unref()`d.
8. **Shutdown** — `SIGTERM`/`SIGINT` stops accepting connections, closes the
   Sequelize pool, then exits; a 10-second forced-exit backstop is armed.

Unhandled rejections are logged. An uncaught exception is logged at `fatal` and
exits the process.

`GET /health` (not under `/api/v1`, never rate limited) reports:

```json
{ "status": "ok", "database": "up", "uptime": 123, "version": "1.0.0", "env": "production" }
```

`503` with `"status": "degraded"` when the database check fails.

---

## 4. Configuration

Defined and validated in `apps/api/src/config/env.js`. `.env.example` documents
the same keys.

### Application

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | `development`, `test`, `production` |
| `PORT` | `4000` | API listening port |
| `API_HOST` | `127.0.0.1` | Bind address; loopback on cPanel |
| `SITE_URL` | required URL | Public origin; CORS and canonical URLs |

### Database

| Variable | Default |
|---|---|
| `DB_HOST` / `DB_PORT` | required / `3306` |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | required / required / `''` |
| `DB_DIALECT` | `mysql` |
| `DB_POOL_MAX` / `DB_POOL_MIN` | `5` / `0` |
| `DB_POOL_ACQUIRE_MS` / `DB_POOL_IDLE_MS` | `30000` / `10000` |
| `DB_SYNC_ALLOWED` | `false` |
| `DB_LOG_QUERIES` | `false` |
| `AUTO_MIGRATE` / `AUTO_SEED` | `true` / `true` |

Pool size is deliberately small because Passenger enforces per-process memory and
shared plans cap connections.

### Authentication

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | required, >= 32 chars | Access-token signing key |
| `JWT_REFRESH_SECRET` | required, >= 32 chars | Must differ from `JWT_SECRET` in production |
| `JWT_ACCESS_TTL` | `15m` | Parsed by `token.service.js` |
| `JWT_REFRESH_TTL` | `30d` | |
| `COOKIE_SECURE` | `false` | Must be `true` in production |
| `COOKIE_DOMAIN` / `COOKIE_PATH` | unset / `/` | |
| `BCRYPT_ROUNDS` | `12` | Must be >= 12 in production |
| `LOGIN_MAX_ATTEMPTS` | `8` | Per account before temporary lock |
| `LOGIN_LOCK_MINUTES` | `15` | |

### CORS and rate limiting

| Variable | Default |
|---|---|
| `CORS_ORIGINS` | comma-separated; falls back to `SITE_URL` |
| `RATE_LIMIT_WINDOW_MS` | `900000` (15 min) |
| `RATE_LIMIT_MAX` | `1200` per window (public surface only) |
| `RATE_LIMIT_AUTH_MAX` | `10` per window |
| `RATE_LIMIT_CONTACT_MAX` | `5` per hour |

Because the browser now calls the API directly with credentials, `CORS_ORIGINS`
must include the site origin (`https://virallinkdigital.com`) and `COOKIE_DOMAIN`
must be the parent domain (`virallinkdigital.com`) with `COOKIE_SECURE=true`.

### Media and storage

| Variable | Default |
|---|---|
| `STORAGE_DRIVER` | `local` (`local` or `s3`) |
| `MEDIA_ROOT` | `./storage/media` (resolved to an absolute path) |
| `MEDIA_PUBLIC_URL` | `/media` |
| `MEDIA_MAX_BYTES` | `10485760` (10 MB) |
| `MEDIA_ALLOWED_TYPES` | `image/jpeg,png,webp,avif,gif` plus `audio/mpeg,mp4,x-m4a,aac,ogg,wav,x-wav,webm,flac` |
| `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_PUBLIC_BASE_URL` | optional; required when `STORAGE_DRIVER=s3` |

### Logging, maintenance, Telegram

| Variable | Default |
|---|---|
| `LOG_LEVEL` | `info` |
| `LOG_PRETTY` | `false` |
| `ACTIVITY_RETENTION_DAYS` | `365` |
| `BACKUP_DIR` / `BACKUP_RETENTION_COUNT` | `./storage/backups` / `14` |
| `TELEGRAM_ENABLED` | `false` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_ANNOUNCE_CHAT_ID` | optional |
| `TELEGRAM_LINK_CODE_TTL_MINUTES` | `30` |

### Production safety checks

The process exits before listening if any of these are true in production:

- `COOKIE_SECURE` is false;
- `DB_SYNC_ALLOWED` is true;
- `BCRYPT_ROUNDS < 12`;
- the two JWT secrets are equal;
- `CORS_ORIGINS` is empty or contains `*`;
- `SITE_URL` is not `https://`;
- `STORAGE_DRIVER=s3` without a bucket/access key;
- `TELEGRAM_ENABLED` without a bot token or webhook secret.

---

## 5. Request pipeline

Order is deliberate and defined in `src/app.js`:

1. `trust proxy` = 1; `x-powered-by` disabled; strong ETag.
2. **Helmet** — CSP (`default-src 'self'`; only self scripts; inline styles and
   Google Fonts allowed; `frame-ancestors 'none'`; HSTS in production), referrer
   policy `strict-origin-when-cross-origin`, CORP `same-site`.
3. **Compression.**
4. **CORS** — explicit origin allowlist, credentials enabled. Requests with no
   `Origin` (same-origin / server-to-server) are allowed.
5. **pino-http** — structured request logging; 5xx logs at `error`, 4xx at
   `warn`. It is configured to read `request.id`, but is mounted just before
   `requestContext` sets it.
6. **`requestContext`** — mints `request.id` (or honours `X-Request-Id`) and
   echoes it as `X-Request-Id`.
7. **`cookie-parser`.**
8. **Body parsing** — JSON (including `application/*+json`) and urlencoded, both
   capped at **1 MB**.
9. **Health check** at `/health`, before rate limiting.
10. **Rate limiting** — `globalLimiter` mounted only on `/api/v1/public` and
    `/api/v1/contact`.
11. **Routes** at `/api/v1`.
12. **`notFoundHandler`**, then **`errorHandler`** last.

Express 5 forwards rejected promises from handlers automatically, so there is no
`asyncHandler` wrapper.

---

## 6. Namespaces and routing

Mounted under `/api/v1` by `src/routes/index.js`:

| Namespace | Auth | Notes |
|---|---|---|
| `/api/v1/` | none | Service identity (`name`, `version`, documentation path) |
| `/api/v1/public/*` | none | Published content only, allowlist serialisers, `globalLimiter` |
| `/api/v1/contact` | none | The only anonymous content write; `contactLimiter` + spam scoring |
| `/api/v1/auth/*` | mixed | Setup, login, refresh, logout, current user, Telegram linking |
| `/api/v1/telegram/*` | secret | Telegram webhook, mounted before the admin router |
| `GET /api/v1/media/*splat` | none | Local media serving, mounted **before** the admin router |
| everything else | session | Admin router mounted at the namespace root |

### Mount-order rules that are load-bearing

- **Media before admin.** The admin router owns the `media` prefix for its
  library. If mounted first it would swallow image requests, demand a session and
  return 401 for every uploaded image. The public media route requires at least
  one segment after `/media/`, so `GET /media` still reaches the admin library.
- **Admin first-segment allowlist.** The admin router checks the first path
  segment against `ADMIN_RESOURCE_PREFIXES`; anything else falls through with
  `next('router')`, producing a genuine 404 rather than a misleading 401.
- **Static sub-routes before `/:id`.** `/tasks/summary`, `/tasks/board`,
  `/tasks/mine`, `/content/board`, `/proposals/summary` are declared before their
  `/:id` counterparts so the literal is never parsed as an id.
- **Telegram webhook before admin.** It must be reachable without a session.

`ADMIN_RESOURCE_PREFIXES`:
`dashboard, company, employees, shareholders, clients, services, portfolio, blog,
inquiries, finance, activity, media, testimonials, stats, jobs, departments, users,
roles, tasks, deliverables, content, proposals`.

The same list is shared with the web app so both sides agree on which paths are
admin resources.

---

## 7. Authentication and session lifecycle

Implementation: `services/auth.service.js`, `services/token.service.js`,
`routes/v1/auth.routes.js`.

### Tokens

| Token | TTL | Secret | Persistence |
|---|---|---|---|
| Access | 15 min (`JWT_ACCESS_TTL`) | `JWT_SECRET` | Stateless; in-memory revocation blocklist |
| Refresh | 30 days (`JWT_REFRESH_TTL`) | `JWT_REFRESH_SECRET` | Row in `refresh_tokens` (jti), revocable |

- Both are HS256 with issuer `virallink-api`.
- Both carry `typ` (`access` / `refresh`) so a refresh token cannot be replayed as
  an access token, and `tv` (`tokenVersion`) so a password change invalidates
  outstanding tokens.
- Delivered as **httpOnly cookies** `vl_access` and `vl_refresh`
  (`SameSite=Lax`, `Secure` per env), and the access token is also returned in the
  login response body for server-to-server callers.
- `requireAuth` accepts `Authorization: Bearer <token>` or the access cookie.
- On every authenticated request `requireAuth` reloads the user, roles and
  permissions from the database. Deactivation, role changes and `tokenVersion`
  changes therefore take effect immediately, not when a token expires.

### Endpoints

| Method | Path | Auth | Behaviour |
|---|---|---|---|
| GET | `/auth/setup-status` | none | `{ needsSetup: boolean }` — whether any user exists |
| POST | `/auth/setup` | none, `authLimiter` | Creates the first `SUPER_ADMIN`; permanently 403 once any user exists. Re-checks inside the insert to close the two-request race. Rate-limited like login |
| POST | `/auth/login` | none, `authLimiter` | bcrypt verify; uniform failure message; account lock after `LOGIN_MAX_ATTEMPTS`; invalid accounts locked out; success resets counters; logs success and failure |
| POST | `/auth/refresh` | refresh cookie or body | Verifies the refresh JWT and its DB row; rotates (revokes old, issues new pair); clears cookies on failure |
| POST | `/auth/logout` | session | Revokes the presented refresh token, or every session with `allSessions: true`; clears cookies |
| GET | `/auth/me` | session | Current user + resolved permission keys |
| POST | `/auth/change-password` | session | Verifies current password, bumps `tokenVersion`, revokes every refresh token, clears cookies |
| POST | `/auth/forgot-password` | none, `authLimiter` | Issues a six-digit reset code and delivers it to the account's linked Telegram chat. Enumeration-safe: the response is identical whether the account exists, is Telegram-linked, was sent a code, or is over the send limit |
| POST | `/auth/reset-password` | none, `authLimiter` | Redeems a code and sets a new password. Every failure — unknown account, wrong code, expired code, exhausted attempts — returns the same 400 |
| GET | `/auth/telegram` | session | Link state |
| POST | `/auth/telegram/link` | session | Issues a one-time code + deep link |
| DELETE | `/auth/telegram/link` | session | Detaches Telegram; outbox history retained |
| POST | `/auth/verify` | none | Cheap signature check for a fast session probe; not authoritative |

Login failures never distinguish unknown email, wrong password and inactive
account. A dummy bcrypt comparison runs on the unknown-email path so response time
does not reveal account existence.

### Password recovery

A forgotten password is recovered by proving control of the account's
Telegram, the same one-time-code mechanism the Telegram linking flow already
uses.

| Step | Detail |
|---|---|
| Request | `POST /auth/forgot-password` with an email address |
| Issue | A six-digit code is generated and stored as `sha256(userId:code)` — the code itself is never written to the database |
| Deliver | The code is queued to the account's linked Telegram chat through the outbox, so a transient failure retries rather than losing it |
| Redeem | `POST /auth/reset-password` with the email, the code and the new password |
| Effect | The password is hashed, `tokenVersion` is bumped, every refresh token is revoked, the lockout is cleared, and the token is consumed |

Five properties are load-bearing.

**Enumeration safety.** `forgot-password` answers identically for every
outcome. It does not say whether the address has an account, whether that
account has Telegram linked, or whether a code was just sent — the last of
which would otherwise reveal which addresses are worth attacking. The rate
limits are the same in every case for the same reason. The response is the
same *shape* in every case; only the one-time token in the deep link differs,
because a token has to be unique.

**A bot cannot message a chat that has never spoken to it.** Telegram will
not deliver to an unknown chat id, so an account with no linked chat cannot be
messaged at all. That case gets a `t.me` deep link instead: opening it starts
the bot, and the bot replies with the code. The link carries a one-time token
that is hashed at rest, and the code is created at the moment the link is
opened — a digest cannot be turned back into the six digits the bot has to
send.

**The link is gated on the account's Telegram username.** A link can be
opened by anybody, so the bot sends a *working* code only to a chat whose
`@username` matches the one registered on the account — the same check
Telegram's own login widget performs. An administrator registers that
username once, having seen the person's Telegram. Without it, knowing a
colleague's email address would be enough to take over their account.

**The bot's reply reveals nothing either.** It always replies with a
six-digit code. When the chat is not the registered one, the code is one that
was never stored, so it does not work — but the reply is identical, and an
attacker cannot tell "this account does not exist" from "this account exists
but is not yours".

**Per-account limits, not per-IP.** The in-memory rate limiter cannot
express "this account", so IP buckets alone do not bound attempts by one account.
The real limits are in the database: `PASSWORD_RESET_MAX_SENDS_PER_HOUR` codes per
account, `PASSWORD_RESET_RESEND_SECONDS` between them, and
`PASSWORD_RESET_MAX_ATTEMPTS` attempts per code. A six-digit code has a
million possible values, which is only safe because of that last one — every
wrong guess is charged against the code, and a code that runs out of attempts
is spent.

**A reset revokes everything.** Bumping `tokenVersion` and revoking the
refresh tokens means a session issued against the old password cannot outlive
it. Clearing `lockedUntil` is equally important: the lockout is checked
*before* the password is compared, so an account locked out after too many
failed attempts cannot sign in with a freshly reset password until the lock
expires on its own.

### Administrator-initiated resets

`POST /users/:id/reset-password` (`user.write`) issues a password for somebody
else. The password is generated by the API rather than supplied by the
administrator, because the person receiving it has no say in how strong it is
and `password123` is what a hurried administrator types when handing
credentials over a phone call.

The generated password is returned once, for the administrator to pass on. It
is never stored in plain text and never reaches the audit log — the log
records that a reset happened, not what the new password was.

The account is flagged `mustChangePassword`, and while that flag is set every
admin endpoint answers `403 PASSWORD_CHANGE_REQUIRED`. `/auth/me`,
`/auth/change-password` and `/auth/logout` stay reachable, which is exactly
the set of calls needed to finish the job. The interface redirects the person
to the change-password screen first, so the API check is the backstop rather
than the primary mechanism — but "this password was set by somebody else" is a
rule that belongs on the server.

Changing a password through the user edit form has the same effect: the
lockout is cleared and every session is revoked.

---

## 8. Authorization (RBAC)

Definitions: `apps/api/src/shared/permissions.js` (mirrored in
`packages/shared/src/permissions.js`). Permission keys are seeded into
`permissions`, `roles` and `role_permissions`.

### Roles

`SUPER_ADMIN` (all permissions, never special-cased), `ADMIN`, `EDITOR`,
`FINANCE`, and granular team roles: `SOFTWARE_ENGINEER`, `VIDEO_EDITOR`,
`DESIGNER`, `PROJECT_MANAGER`, `CONTENT_WRITER`, `SOCIAL_MEDIA_MANAGER`,
`GRAPHIC_DESIGNER`, `MOTION_DESIGNER`, `COPYWRITER`, `SEO_SPECIALIST`,
`MARKETING_COORDINATOR`.

A user may hold several roles; effective permissions are the union.

### Permission catalogue

`company.read/write`, `settings.read/write`, `user.read/write`, `role.read/write`,
`employee.read/write/delete`, `shareholder.read/write/delete`,
`client.read/write/delete`, `inquiry.read/write`, `service.read/write/delete`,
`project.read/write/delete`, `blog.read/write/delete`, `testimonial.write`,
`job.write`, `finance.read/write/delete`, `media.read/write/delete`,
`activity.read`, `activity.read_own`, `activity.delete`,
`task.read/write/delete/assign`, `content.read/write`.

### Enforcement

`src/middleware/rbac.js`:

- `requirePermission(...keys)` — any-of. Declared on each route next to the
  handler it protects.
- `requireAllPermissions(...keys)` — every-of. Available for cross-domain actions.
- `requireRole(...roles)` — coarse; discouraged in favour of permissions.
- `requireOwnership(fn)` — ownership scoping helper.

Status codes: **401** no session, **403** signed in without the permission
(logged at `warn` with user, required keys, path and method), **422** unknown
permission key in a route definition (a code bug).

### Role capability summary

| Role | Can do |
|---|---|
| SUPER_ADMIN | everything |
| ADMIN | company read/write and settings read; employee/client/service/project/blog read+write but no delete; inquiries; testimonials; jobs; tasks including delete/assign; media read/write but no delete; activity log view-all + clear. No finance, shareholders, users/roles or content pipeline |
| EDITOR | read company/employees/clients; write services/portfolio/blog/testimonials/jobs; full content pipeline; tasks (write/assign, no delete); media |
| FINANCE | finance full, read clients/inquiries/shareholders, tasks (read/write), media, full activity log |
| SOFTWARE_ENGINEER | tasks, content pipeline, media, projects |
| VIDEO_EDITOR / DESIGNER / SOCIAL_MEDIA_MANAGER / GRAPHIC_DESIGNER / MOTION_DESIGNER | tasks, media |
| PROJECT_MANAGER | tasks, projects, clients |
| CONTENT_WRITER / COPYWRITER | content pipeline, blog, tasks |
| SEO_SPECIALIST | content pipeline, blog |
| MARKETING_COORDINATOR | clients, projects, tasks |

Exact grants live in `ROLE_PERMISSIONS`; this table is a reading aid.

### Deliberate separations

- `content.*` is separate from `client.*` so production staff can run the board
  without the power to edit contract values.
- Deliverables/metrics reuse `client.read/write` rather than a second `report.*`
  family. The one exception is `POST /deliverables`, which also accepts
  `content.write` so the board's New-card action works for production roles.
- Role permissions are read-only through the API. Changing grants is a seeder
  change, reviewed as code.

---

## 9. Validation and mass assignment

- Shared Zod schemas in `apps/api/src/shared/schemas.js`; route wrappers in
  `src/middleware/schemas.js` exposed as `v('schemaName')`.
- Sources: `body`, `query`, `params`. Parsed output replaces the input, so
  handlers receive exactly what should be persisted.
- `GET` query parsing writes to `request.validatedQuery` because Express 5's
  `req.query` is getter-only.
- Sort fields are whitelisted per endpoint by `makeListQuerySchema([...])`. An
  unknown `?sort=` is a 422, never a silently wrong order.
- Pagination defaults: `page` 1, `pageSize` 20 for admin lists. Public
  `portfolio` defaults to 12 (max 48); public `blog` defaults to 10 (max 24);
  the generic `publicList` schema defaults to 12 (max 50).
- `idFrom(request)` rejects non-numeric ids before any query.
- Body validation stores a redacted copy at `request.originalBody` for audit
  diffs. Credential-shaped keys are replaced with `[redacted]`.
- Services pass payloads through `allowOnly(payload, allowedFields)` or an
  explicit field list, so unknown keys (for example `isSystem`, `roleId`) cannot be
  mass-assigned.

Validation failure response: **422** with field-keyed `error.details`.

---

## 10. Response contract and errors

### Success

```json
{
  "data": {},
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 42,
    "totalPages": 3,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

`meta` accompanies lists. `totals` is added where an aggregate is meaningful
(for example shareholders). Some endpoints return a named sub-object in `data`
(`{ services }`, `{ team }`, `{ jobs }`, `{ categories, tags }`).

### Money on the wire

Raw money columns are Sequelize `DECIMAL` **strings** (`"1234.56"`). Aggregates
and reports convert to **integer minor units** (cents) to avoid float error. The
client formats for display.

### Errors

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields need attention",
    "details": { "email": ["Enter a valid email address"] },
    "requestId": "..."
  }
}
```

| Status | Codes |
|---|---|
| 400 | `BAD_REQUEST`, `INVALID_JSON`, `INVALID_UPLOAD`, `NO_FILE` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` (duplicate unique value, e.g. email) |
| 413 | `PAYLOAD_TOO_LARGE`, `FILE_TOO_LARGE` |
| 422 | `VALIDATION_ERROR` |
| 429 | `RATE_LIMITED` (with `retryAfter`) |
| 500 | `INTERNAL_ERROR` — generic message + `requestId`; stack stays in logs. `debug` only outside production |

A `SequelizeUniqueConstraintError` is translated to 409 and names the offending
column.

---

## 11. Security controls

- **Helmet CSP:** no framing, no object embedding, scripts self-only, HSTS in
  production.
- **CORS:** explicit allowlist; production boot rejects `*`; credentials enabled.
- **Cookies:** httpOnly, `SameSite=Lax`, `Secure` in production.
- **Rate limiting:** public reads + contact only, plus a tighter auth budget.
  Admin traffic is not IP-limited; it already requires a session and per-route
  permission, enforced by the API on every call.
- **Body limits:** 1 MB JSON/urlencoded; uploads capped by `MEDIA_MAX_BYTES`, at
  most 10 files, MIME allowlist.
- **Uploads:** multer holds files in memory; `sharp` re-decodes each file and is
  the authoritative check. Files are re-encoded to WebP and written with
  generated keys, never the client filename.
- **SQL injection:** Sequelize bound parameters throughout; LIKE wildcards escaped
  in `normaliseSearch`.
- **Mass assignment:** `allowOnly` / explicit allowlists in services.
- **Password handling:** bcrypt cost 12; plaintext never persisted or logged.
- **Privacy:** contact inquiries store a salted HMAC of the IP (`ipHash`), never
  the raw address. Referrer and UTM fields are stored for attribution.
- **Audit redaction:** secrets, tokens and password fields are replaced with
  `[redacted]` before an `activity_logs` row is written.
- **Traversal guard:** stored media keys are pattern-validated and resolved under
  `MEDIA_ROOT` before any filesystem access.
- **Public/private boundary:** the field allowlist in `serializers/public.js` is
  the single boundary. A new model column cannot become public without being added
  there explicitly.

---

## 12. Public API

All routes below are unauthenticated, read-only, published-content only, and pass
through `serializers/public.js`. Responses are cached in-process (see §19).

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/public/company` | `{ company, favicon }`: profile, social links, published stats, published testimonials, logo |
| GET | `/api/v1/public/services` | `{ services }` published, ordered; each with image and FAQ |
| GET | `/api/v1/public/services/:slug` | `{ service, projects }` — one published service + up to 6 related projects; 404 if unpublished or unknown |
| GET | `/api/v1/public/portfolio` | Paginated published projects; `?service=<slug>`, `?featured=true`; default page size 12 |
| GET | `/api/v1/public/portfolio/:slug` | One published project with images, tech stack, client display name, service |
| GET | `/api/v1/public/team` | `{ team }` flat, ordered list of employees where `isPublic=true` and `employmentStatus='active'`; explicit field allowlist |
| GET | `/api/v1/public/clients` | `{ clients }` only clients with `isPublic=true` |
| GET | `/api/v1/public/testimonials` | `{ testimonials }` published, limit 6 |
| GET | `/api/v1/public/jobs` | `{ jobs }` published roles that have not closed |
| GET | `/api/v1/public/jobs/:slug` | One published job; 404 otherwise |
| GET | `/api/v1/public/blog` | Paginated published posts; `?category=<slug>`, `?tag=<slug>` |
| GET | `/api/v1/public/blog/:slug` | One published post with author name, categories, tags; drafts 404 |
| GET | `/api/v1/public/blog-taxonomy` | `{ categories, tags }` |
| GET | `/api/v1/media/*splat` | Stored media (local driver); `Cache-Control: immutable` for one year |

Public field rules:

- **Employees:** name, position, biography, LinkedIn, display order, department
  name, photo. Email, phone, employment status and join date are never exposed.
- **Clients:** name, industry, website, logo. Contact details, notes, contract
  value and status are never exposed.
- **Company:** registration number and tax identifier are excluded.
- **Projects:** only the client display name and logo, never contact data.
- **Blog:** only the author's display name, never email or role.
- **Media:** URL, kind, MIME, dimensions, alt/title/caption, blur placeholder.
- Drafts and unpublished records are indistinguishable from missing records (404).

`listSitemapEntries()` returns published slugs for services, projects, posts and
jobs. Sitemap rendering itself is the web app's responsibility.

---

## 13. Contact intake

Routes: `routes/v1/contact.routes.js`, service: `services/inquiry.service.js`.

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/v1/contact/nonce` | Returns `{ nonce, loadedAt }` for submission timing |
| POST | `/api/v1/contact` | Validates, scores spam, stores, returns `201 { id, message }` |

- Rate limited with `contactLimiter` (5 per hour per IP).
- Honeypot field: `website`.
- Timing signal: the `X-Form-Loaded-At` header. `GET /contact/nonce` gives the
  form a server timestamp, but the submitted timing is read from the header; the
  nonce value itself is not verified.
- Spam is **scored and stored**, not discarded, so a false positive does not lose
  a real lead. The score and reasons are recorded on the inquiry row; there is no
  automatic blocking or hiding, so the admin inbox shows flagged rows too.
- Score signals: filled honeypot +100, links +15, 10+ repeated characters +20,
  markup +25, submitted under 1.5 seconds +15, missing User-Agent +10, missing IP
  hash +5. Capped at 100.
- The response is identical for spam and legitimate submissions, so a bot learns
  nothing.
- A referenced `serviceId` is accepted only if the service is published.
- An activity log row `contact_submitted` records id, score and reasons.

---

## 14. Telegram integration

Optional; inert until `TELEGRAM_ENABLED=true`. No long-running bot process — the
deployment target cannot keep one alive.

| Method | Path | Behaviour |
|---|---|---|
| POST | `/api/v1/telegram/webhook/:secret` | Webhook; requires the secret in the path **and** in `X-Telegram-Bot-Api-Secret-Token`. Acknowledges before processing so Telegram does not retry |

- Linking: `POST /auth/telegram/link` issues a one-time code and deep link. The
  user opens the bot; the bot learns the chat id from the update. A client can
  never supply a chat id, so one account cannot claim another.
- Outbound messages are written to `telegram_outbox` and delivered inline and by
  a cron drain (`node src/scripts/telegramOutbox.js`). Enqueue never fails the
  action that produced it.
- Events implemented: task assigned, task status changed. Recipient resolution
  prefers `assigneeUserId`, then the user linked to the assigned employee.
- Outbound text is HTML-escaped.

---

## 15. Admin API

Everything below requires a session (`requireAuth`) and, except where marked
session-only, the permission shown (`requirePermission` on the route). Validation
middleware is present on every mutating route. See `docs/ADMIN_SPEC.md` for
page-level behaviour.

### Dashboard and company

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard/summary` | `client.read` |
| GET | `/company` | `company.read` |
| PUT | `/company` | `company.write` |
| PUT | `/company/social-links` | `company.write` |

### Employees and departments

| Method | Path | Permission |
|---|---|---|
| GET | `/employees` | `employee.read` |
| GET | `/employees/:id` | `employee.read` |
| POST | `/employees` | `employee.write` |
| PUT | `/employees/:id` | `employee.write` |
| DELETE | `/employees/:id` | `employee.delete` (archives/soft-deletes) |
| POST | `/employees/reorder` | `employee.write` |
| GET | `/departments` | `employee.read` |
| POST | `/departments` | `employee.write` |

Employee rows include a `login` field (`null` or `{ userId, email, isActive }`) so
the console can offer "Create login" only where one does not exist.

### Shareholders — confidential, no public counterpart

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/shareholders` | `shareholder.read` / `shareholder.write` |
| GET / PUT / DELETE | `/shareholders/:id` | `shareholder.read` / `shareholder.write` / `shareholder.delete` |

`GET /shareholders` also returns `totals` for the holdings summary.

### Clients and CRM

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/clients` | `client.read` / `client.write` |
| GET / PUT / DELETE | `/clients/:id` | `client.read` / `client.write` / `client.delete` |
| POST | `/clients/:id/notes` | `client.write` |
| POST | `/clients/:id/communications` | `client.write` |
| GET | `/clients/:id/report` | `client.read` |
| GET | `/clients/:id/totals` | `client.read` |

### Services, portfolio, blog

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/services` | `service.read` / `service.write` |
| GET / PUT / DELETE | `/services/:id` | `service.read` / `service.write` / `service.delete` |
| POST | `/services/reorder` | `service.write` |
| GET / POST | `/portfolio` | `project.read` / `project.write` |
| GET / PUT / DELETE | `/portfolio/:id` | `project.read` / `project.write` / `project.delete` |
| POST | `/portfolio/reorder` | `project.write` |
| GET / POST | `/blog` | `blog.read` / `blog.write` |
| GET / PUT / DELETE | `/blog/:id` | `blog.read` / `blog.write` / `blog.delete` |
| GET / POST | `/blog/categories` | `blog.read` / `blog.write` |
| GET / POST | `/blog/tags` | `blog.read` / `blog.write` |

### Inquiries

| Method | Path | Permission |
|---|---|---|
| GET | `/inquiries` | `inquiry.read` |
| GET | `/inquiries/:id` | `inquiry.read` |
| PUT | `/inquiries/:id` | `inquiry.write` |
| POST | `/inquiries/:id/archive` | `inquiry.write` |

### Finance

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/finance/transactions` | `finance.read` / `finance.write` |
| PUT / DELETE | `/finance/transactions/:id` | `finance.write` / `finance.delete` |
| GET / POST | `/finance/categories` | `finance.read` / `finance.write` |
| GET / POST | `/finance/invoices` | `finance.read` / `finance.write` |
| GET / PUT | `/finance/invoices/:id` | `finance.read` / `finance.write` |
| POST | `/finance/payments` | `finance.write` |
| DELETE | `/finance/payments/:id` | `finance.delete` |

Invoice totals and status are recalculated inside the same transaction that writes
line items or payments. Payments update the invoice's `paidAmount` and derived
status.

### Media, branding, careers

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/media` | `media.read` / `media.write` |
| PUT / DELETE | `/media/:id` | `media.write` / `media.delete` |
| GET / POST / PUT / DELETE | `/testimonials`, `/testimonials/:id` | `testimonial.write` (reads included) |
| GET / POST / PUT / DELETE | `/stats`, `/stats/:id` | `company.read` / `company.write` |
| GET / POST / PUT / DELETE | `/jobs`, `/jobs/:id` | `job.write` (reads included) |

Images are decoded with sharp, re-encoded to WebP and stripped of EXIF. Audio
is stored exactly as uploaded — there is no audio pipeline — so it is checked
by its container signature instead (MP3, Ogg, WAV, MP4/M4A, FLAC, WebM, ADTS
AAC) and served with the content type from the media table, never from the
uploaded filename.

### Publish toggle

`PUT /{blog|services|portfolio|testimonials|jobs}/:id/publish` accepts only
`{ isPublished }` and updates only that state. For blog posts it sets
`status = published|draft` and stamps or clears `publishedAt`. This exists because
each resource's full upsert validator would reject a partial publish payload with
a 422.

### Users, roles, activity

| Method | Path | Permission |
|---|---|---|
| GET / POST | `/users` | `user.read` / `user.write` |
| PUT / DELETE | `/users/:id` | `user.write` |
| POST | `/users/:id/reset-password` | `user.write` (issues a generated temporary password; forces a change at the next sign-in) |
| POST | `/users/:id/employee` | `employee.write` (creates + links an HR profile) |
| GET | `/roles` | `role.read` |
| GET | `/activity` | `activity.read` (the handler still contains an "own rows only" branch, but the permission check makes it unreachable) |
| DELETE | `/activity?from=&to=` | `activity.delete`; at least one bound required; the wipe is itself audited |

User safeguards: the last active SUPER_ADMIN cannot be deleted, deactivated or
demoted, and nobody may remove their own SUPER_ADMIN role or deactivate
themselves. An email held by a soft-deleted account revives that account rather
than failing on the unique index; an email held by an active account is a 409.

### Tasks (internal)

| Method | Path | Permission |
|---|---|---|
| GET | `/tasks` | `task.read` |
| GET | `/tasks/summary` | `task.read` |
| GET | `/tasks/board` | `task.read` |
| GET | `/tasks/mine` | session only — returns only the caller's own tasks |
| GET | `/tasks/:id` | `task.read` |
| POST / PUT | `/tasks`, `/tasks/:id` | `task.write` |
| DELETE | `/tasks/:id` | `task.delete` |

`/tasks/mine` and `/tasks/board` are bounded and declared before
`/tasks/:id`. The board returns every open task (cap 500) plus the **ten** most
recently finished ones, and `finishedTotal` — the true count of closed tasks —
so the board can report how much history it is not showing. `?finished=N`
widens that window (clamped to 1–200) for when someone wants to look further
back without leaving the board; the window lives in the URL, so the board stays
a server-rendered page and the view can be shared or reloaded. The rest of the
history is reachable from `/tasks` with a `status` filter.

### Client reporting

| Method | Path | Permission |
|---|---|---|
| GET | `/deliverables` | `client.read` |
| POST | `/deliverables` | `client.write` **or** `content.write` |
| PUT / DELETE | `/deliverables/:id` | `client.write` |
| POST | `/deliverables/metrics` | `client.write` (upsert: 200 on update, 201 on create) |
| DELETE | `/deliverables/metrics/:id` | `client.write` |

`GET /clients/:id/report?month=YYYY-MM&months=6` returns headline totals, trend,
platform split, top performers and approval/cycle figures in one call.

### Content production pipeline

| Method | Path | Permission |
|---|---|---|
| GET | `/content/clients` | `content.read` — id + name only |
| GET | `/content/board` | `content.read` — `?clientId=`, `?includePosted=true` |
| GET | `/content/cycle-time` | `content.read` — `?clientId=` |
| GET | `/content/weekly` | `content.read` — `?week=YYYY-MM-DD`, `?clientId=` |
| PUT | `/content/:id` | `content.write` |
| POST | `/content/:id/stage` | `content.write` — records a stage-history event |
| GET | `/content/:id/history` | `content.read` |
| GET | `/proposals` | `content.read` — `?clientId=`, `?status=` |
| GET | `/proposals/summary` | `content.read` |
| POST | `/proposals` | `content.write` |
| PUT / DELETE | `/proposals/:id` | `content.write` |

Stage moves are separate from field updates so every transition is recorded in
`content_stage_events`; cycle-time and approval metrics are derived from that
history rather than reconstructed from current state.

---

## 16. Data model

Declared as data in `src/models/definitions.js`, registered with associations in
`src/models/index.js`.

Conventions:

- `BIGINT UNSIGNED` auto-increment primary keys.
- `VARCHAR(191)` for unique/indexed string columns (utf8mb4 index limit).
- `DECIMAL(14,2)` for money, `DECIMAL(12,2)` for quantities and watch hours,
  `DECIMAL(5,2)` for percentages and tax rates.
- `created_at` / `updated_at`; soft delete via `deleted_at` (`paranoid`) on
  business tables.
- `activity_logs`, `refresh_tokens`, `content_stage_events`, `invoice_items`,
  `payments`, `client_notes` and `client_communications` are not soft-deleted where
  a permanent record is correct.

### Identity and access

| Table | Key columns |
|---|---|
| `permissions` | `key` (unique), `description`, `group` |
| `roles` | `key` (unique), `name`, `description`, `is_system` |
| `role_permissions` | `role_id`, `permission_id` |
| `users` | `name`, `email` (unique), `password_hash`, `is_active`, `last_login_at`, `token_version`, `failed_login_attempts`, `locked_until`, `password_changed_at`, `employee_id`, `role`, Telegram columns |
| `user_roles` | `user_id`, `role_id` |
| `refresh_tokens` | `user_id`, `token_id` (unique jti), `expires_at`, `revoked_at`, `user_agent`, `ip` |
| `telegram_outbox` | `user_id?`, `chat_id?`, `kind`, `payload` JSON, `status`, `attempts`, `last_error`, `sent_at` |

### Company and branding

| Table | Key columns |
|---|---|
| `companies` | singleton profile: identity, address/geo, contact, mission/vision/values, logo/favicon media, SEO meta |
| `social_links` | `company_id`, `platform`, `url`, `display_order` |
| `company_stats` | `company_id`, `label`, `value`, `is_published`, `display_order` |
| `testimonials` | author, body, rating, `client_id?`, `is_published`, `display_order` |

### People

| Table | Key columns |
|---|---|
| `departments` | `name` (unique), description, order |
| `employees` | name, position, `department_id`, biography, `photo_media_id`, private email/phone, LinkedIn, employment status, `is_public`, order |
| `shareholders` | name, share class, share count, ownership percent, status, `parent_id` (self-reference), notes |

### Clients and work

| Table | Key columns |
|---|---|
| `clients` | name, contact person, email, phone, website, industry, address, status, source, notes, logo, `is_public`, contract value |
| `client_notes` | `client_id`, `user_id`, body |
| `client_communications` | `client_id`, `user_id`, type, subject, body, `occurred_at` |
| `projects` | title, slug, `client_id`, `service_id`, summary/description, challenge/solution/results, technologies JSON, cover media, status, featured/published, dates, SEO meta |
| `project_images` | `project_id`, `media_id`, caption, order |
| `technologies` / `project_technologies` | technology names and the join table |

### Public content

| Table | Key columns |
|---|---|
| `services` | title, slug (unique), summary, description, icon, image media, `parent_id`, order, `is_published`, SEO meta, FAQ JSON |
| `blog_posts` | title, slug (unique), excerpt, content, featured media, author, `status` draft/published, `published_at`, SEO meta |
| `blog_categories` / `blog_tags` | name, slug (unique), description |
| `blog_post_categories` / `blog_post_tags` | join tables |
| `jobs` | title, slug, department, employment type, location, remote, description, requirements, apply email/URL, published, `closes_at`, order |

### Media

| Table | Key columns |
|---|---|
| `media` | `key` (unique), `url`, kind, MIME, width/height, size, alt/title/caption, `blur_data_url`, uploader, folder |

### Finance

| Table | Key columns |
|---|---|
| `financial_categories` | name, type (income/expense), `is_system` |
| `financial_transactions` | type, amount, currency, category, client/project, description, date, payment method, reference, status, notes, creator |
| `invoices` | client/project, `invoice_number` (unique), issue/due date, currency, tax rate, subtotal/tax/total/paid, status, notes, creator |
| `invoice_items` | `invoice_id`, description, quantity, unit price, line total, position |
| `payments` | `invoice_id`, amount, currency, method, reference, `paid_at`, notes, creator |

### Production pipeline

| Table | Key columns |
|---|---|
| `content_deliverables` | `client_id`, title, type, platform, URL, published date, media, notes, `stage`, shoot/scheduled dates, assignee, revision count, stage-specific text fields |
| `content_metrics` | `deliverable_id`, `month` (`YYYY-MM`), platform, views/likes/comments/shares, watch hours, source. Unique on `(deliverable_id, month, platform)` |
| `content_stage_events` | `deliverable_id`, `from_stage`, `to_stage`, `user_id`, note — append-only |
| `client_proposals` | `client_id`, title, summary, scope, status, value, proposed start, responded date |
| `tasks` | title, description, status, priority, `assignee_id` (Employee), `assignee_user_id` (User), client/project, due date, `completed_at` |

### Leads and audit

| Table | Key columns |
|---|---|
| `contact_inquiries` | name, email, phone, company, subject, service, message, status, is_read/archived, assignee, notes, `ip_hash`, `spam_score`, UTM fields, referrer |
| `activity_logs` | `user_id?`, `user_email?`, action, entity, `entity_id`, metadata JSON (redacted), IP, user agent, created at. Append-only, no soft delete |

### Integrity rules

- Unique slugs are generated by `generateUniqueSlug()` with a numeric suffix; the
  check includes soft-deleted rows because the unique index still covers them.
- Invoice money is computed in integer cents and denormalised totals are written in
  the same transaction as their lines/payments.
- Content metrics are unique per deliverable/month/platform at the database level,
  so concurrent saves cannot double-count.
- Shareholder data has no public route at all.
- Archiving an employee is a soft delete plus `isPublic=false`; the linked user
  account is left intact. The `users.employee_id` foreign key is
  `ON DELETE SET NULL`, so an eventual hard delete would clear the link rather
  than remove the login, but the archive path does not clear it.

---

## 17. Service layer

Routes stay thin: parse -> call service -> respond. Business logic and
transactions live in `src/services/`.

| Service | Responsibility |
|---|---|
| `auth.service.js` | Login, refresh, logout, password change/reset, session issuance, `toPublicUser` |
| `token.service.js` | JWT sign/verify, revocation blocklist, `requireAuth`, cookie options |
| `admin.service.js` | CRUD for company, employees, shareholders, clients, services, portfolio, blog, inquiries, finance, media, branding; audit logging per mutation; public-cache invalidation |
| `dashboard.service.js` | Dashboard aggregations (counts, finance, trend, status breakdown, service distribution, recent activity/inquiries, deadlines) |
| `public.service.js` | Public reads, allowlist serialisation, public cache, sitemap slug lists |
| `inquiry.service.js` | Contact validation, spam scoring, storage, audit |
| `media.service.js` | Sharp validation/transform, blur placeholder, local/S3 writes, deletion, media reads, IP hashing |
| `report.service.js` | Deliverables, monthly metrics upsert, per-client report and totals |
| `pipeline.service.js` | Content board, stage moves + history, cycle time, weekly report, proposals |
| `task.service.js` | Task CRUD, summaries, assignment, per-user tasks |
| `user.service.js` | User CRUD, role assignment, employee-profile linking, last-super-admin guard |
| `notifications.service.js` | Telegram message rendering/enqueue, outbox drain, task event hooks |
| `telegram.service.js` | Bot transport (send, webhook admin, HTML escaping) |
| `telegram-link.service.js` | Link codes, redemption, unlink, link state |

Cross-cutting utilities:

| Utility | Responsibility |
|---|---|
| `utils/money.js` | Decimal-to-cents conversion, invoice totals, status derivation, outstanding balance |
| `utils/cache.js` | In-process LRU with TTL, prefix invalidation, access-token blocklist, random tokens |
| `utils/query.js` | Unique slugs, pagination meta, limit/offset, search normalisation |
| `utils/AppError.js` | Typed operational errors and status-code mapping |
| `middleware/validate.js` | Zod middleware, audit redaction, mass-assignment allowlist, client IP |
| `middleware/audit.js` | Activity rows, diffs, publish actions |
| `middleware/rbac.js` | Permission/role/ownership enforcement |

---

## 18. Media pipeline

1. `multer` receives multipart files into memory (no temp file, never in the
   document root). Limits: at most 10 files, `MEDIA_MAX_BYTES`, MIME allowlist.
2. `media.service.js` decodes each file with `sharp` — declared MIME is not
   trusted. Invalid images and animated/multi-page payloads (decompression-bomb
   risk) fail the upload.
3. Images are resized to a maximum 2400 px longest edge, converted to WebP (which
   also strips EXIF), and a 20 px blur placeholder is generated for
   `blurDataUrl`.
4. The storage key is generated as `<folder>/<YYYY>/<MM>/<random>.webp`; the client
   filename and extension are never used.
5. `STORAGE_DRIVER=local` writes under `MEDIA_ROOT`; `s3` writes to the configured
   bucket. The key/metadata row is identical either way.
6. `GET /api/v1/media/<key>` serves local files with `Cache-Control: immutable`
   for one year. Keys are validated and resolved under the media root.
7. Deletes remove the storage object and the media row; public cache is
   invalidated.
8. `sharp` concurrency is limited to 1 because shared hosting kills memory-heavy
   processes.

Admin uploads go straight to `POST /api/v1/media` through `browserApiUrl()`
with `credentials: 'include'`; there is no Next route handler in the middle.
Stored media is served by the API: Next redirects `/media/*` to the public API
URL, so the browser fetches the file directly.

---

## 19. Caching and invalidation

In-process LRU (`utils/cache.js`), maximum 500 entries, per-process.

| Group | TTL |
|---|---|
| Public lists | 120 s |
| Public detail pages | 300 s |
| Company profile | 600 s |

- Cache keys are namespaced (`public:...`).
- Admin **service** mutations that change public content call
  `invalidatePublicContent()` (prefix `public`), so changes appear on the next
  render instead of after the TTL.
- Exception: the generic publish toggle (`PUT /{resource}/:id/publish`) updates
  the model directly to avoid the full upsert validator, and therefore does not
  invalidate the cache. A publish/unpublish through that button can stay stale
  until the TTL expires (120-600 s); the resource's normal `PUT /:id` does
  invalidate.
- The cache is **never** used for authorization decisions or per-user data.
- The access-token blocklist is a separate in-memory map with per-entry expiry,
  pruned on write and hourly.

Because Passenger may run more than one worker, a cache or blocklist entry is not
globally consistent. Refresh-token revocation and every persistent fact live in
MySQL.

---

## 20. Background work, scripts and cron

| Script | Command | Purpose |
|---|---|---|
| `src/scripts/backup.js` | `npm run backup` | MySQL dump into `BACKUP_DIR`, rotation by `BACKUP_RETENTION_COUNT` |
| `src/scripts/createAdmin.js` | `npm run create:admin` | Create an administrator from the shell (cPanel fallback) |
| `src/scripts/pruneActivity.js` | `npm run prune:activity` | Prune expired refresh tokens, old activity logs, and soft-deleted rows older than a year |
| `src/scripts/telegramOutbox.js` | `node src/scripts/telegramOutbox.js` | Drain queued Telegram messages |
| `src/scripts/telegramWebhook.js` | `node src/scripts/telegramWebhook.js set\|delete` | Register/inspect the webhook |

Recommended cPanel cron:

- nightly maintenance (`prune:activity`);
- daily database backup (`backup`);
- every 5 minutes Telegram outbox drain (only when enabled).

There is no in-process long-lived scheduler; Passenger restarts would lose it. The
hourly token/blocklist prune inside the server is the only timer.

---

## 21. Observability

- **Logs:** pino JSON to stdout (pretty only when `LOG_PRETTY=true`); cPanel
  captures them. Every request logs method, path, status and duration; 4xx at
  `warn`, 5xx at `error`.
- **Request ids:** minted or accepted from `X-Request-Id`, returned on every
  response and included in error bodies and logs.
- **Auth failures:** authorization denials log user id, required permissions,
  path and method.
- **Audit trail:** `activity_logs` records create/update/delete/publish/archive,
  auth events (login, login_failed, logout, password_change), financial events and
  role changes, with a redacted diff. Failures to write an audit row are logged
  but never fail the user's request.
- **Health:** `GET /health` includes database reachability.

---

## 22. Testing

API test scripts:

| Command | Scope |
|---|---|
| `npm run test` | `node --test test/money.test.js test/isolation.test.js` |
| `npm run test:integration` | `node scripts/run-suites.mjs` |
| `npm run db:test:prepare` | `node scripts/prepare-test-db.mjs` |
| `npm run test:all` | Both |

- `money.test.js` covers exact decimal-to-cents conversion, rejection of more than
  two decimals, invoice totals, tax, status derivation and outstanding balance.
- `isolation.test.js` covers the public/private data boundary and tenant-style
  field isolation.
- `test/auth.js` and `test/smoke.js` are integration fixtures driven by the suite
  runner.
- The integration suites run against a **separate database** (`virallink_test` by
  default, set with `TEST_DB_NAME`). They create employees, clients, services,
  projects and tasks to exercise the RBAC rules and do not remove everything they
  make, so running them against the development database would leave fixture rows
  behind in the admin screens. `scripts/prepare-test-db.mjs` creates the database,
  applies the migrations and seeds the RBAC baseline before the suites start; the
  runner refuses to start if `TEST_DB_NAME` points at the development database.
- Lint is a syntax check: `node --check src/server.js`.

The project does not currently have a full HTTP-level test matrix for every admin
route; the RBAC matrix and route permissions are the intended contract.

---

## 23. Deployment constraints that shape the backend

- `output: 'standalone'` is not used; Passenger expects `node_modules` in the app
  root.
- Two Passenger "Setup Node.js App" entries: one for web, one for API. Both bind
  loopback; the web app is reached at `https://virallinkdigital.com` and the API
  at its public subdomain `https://api.virallinkdigital.com`, with Passenger
  forwarding requests to the loopback processes internally.
- Migrations and the RBAC seed run at API boot, not from a manual button, because
  cPanel may expose no shell. The advisory lock makes multi-worker boot safe.
- Media lives outside `public_html` unless the host forces an in-root layout; the
  `MEDIA_ROOT` variable is the only switch.
- `AUTO_MIGRATE` and `AUTO_SEED` default to true. Turning them off is only sensible
  where a human can deliberately run `npm run migrate` / `npm run seed`.
- Connection pooling is capped and image concurrency is 1 to stay within
  Passenger's memory limits.

Full runbook: `docs/DEPLOYMENT.md`.

---

## 24. Known limitations and latent issues

These are deliberate trade-offs or current gaps, recorded so the next engineer is
not surprised.

1. **Per-process state.** Cache, rate limits and the access-token blocklist are
   in-memory. Multiple Passenger workers do not share them. Persistent revocation
   is handled by `refresh_tokens`, but an access token revoked in one worker could
   still validate in another for up to its 15-minute lifetime.
2. **Mixed money representation on the wire.** Raw columns are decimal strings;
   aggregates/reports are integer cents. Consumers must follow the endpoint, not a
   single global rule.
3. **Latent query fallback bug.** `middleware/schemas.js` defines
   `query(request) { return request.validatedQuery || query(request) }`. The
   fallback branch recurses instead of reading `request.rawQuery`/`request.query`.
   Every current caller runs a query validator first, so the branch is not reached,
   but it will stack-overflow if a future route calls `query(request)` without
   `v(...)`.
4. **Unmounted helpers.** `uploadLimiter`, `perKeyCounter`, `optionalAuth`,
   `requireRole`, `requireAllPermissions` and `requireOwnership` are implemented
   but not currently used. `uploadLimiter` in particular means uploads rely on
   the session/permission check plus multer limits, not a dedicated rate-limit
   budget.
5. **`activity.read_own` is effectively redundant.** `GET /activity` requires
   `activity.read`; the "own rows only" branch is a runtime check on the same
   permission. No seeded role holds `read_own` alone.
6. **Public cache invalidation is per-process and not universal.** A write in one
   worker does not drop another worker's LRU, and the generic publish toggle
   updates the row without invalidating at all. TTLs (120-600 s) bound the
   staleness in both cases.
7. **Telegram is best-effort.** Only task-assigned and task-status-changed events
   are wired. Delivery depends on the outbox drain; enqueue failures are logged
   and swallowed by design.
8. **No full route-level integration suite.** The money and isolation suites are
   solid; admin CRUD/RBAC coverage is thinner than the route catalogue.
9. **`AUTO_MIGRATE` on every boot** makes deployment one action but couples app
   start to schema change. A failed migration prevents the API from listening,
   which is the intended loud failure.
10. **Public employee listing depends on `isPublic`.** An employee with a linked
    user account is not public until an administrator opts them in; this is
    privacy-by-default, not a bug.
11. **Dangling documentation link.** `GET /api/v1/` advertises
    `documentation: '/docs/API.md'`, but that file is not in the repository. This
    document is the actual backend reference.

---

## 25. Extending the backend — checklist

To add a new admin resource:

1. Add the model to `src/models/definitions.js` and its associations to
   `src/models/index.js`.
2. Add a migration under `src/migrations/` (`.cjs`, timestamp-prefixed) using the
   idempotent helpers in `src/migration-helpers/`.
3. Add Zod schemas in `src/shared/schemas.js` and wrappers in
   `src/middleware/schemas.js`.
4. Add the permission keys to `apps/api/src/shared/permissions.js` and
   `packages/shared/src/permissions.js`, then grant them in `ROLE_PERMISSIONS`.
5. Add the first path segment to `ADMIN_RESOURCE_PREFIXES`.
6. Add service functions in `src/services/` with `allowOnly` field lists, audit
   logging and public-cache invalidation where relevant.
7. Add routes in `src/routes/v1/admin.routes.js` with `requirePermission` directly
   on each route. Put literal sub-routes before `/:id`.
8. If the resource is public, add a public route under `/public`, a query that
   filters on `isPublished`/`isPublic`, and an explicit serialiser in
   `src/serializers/public.js`.
9. Add tests, and update `docs/ADMIN_SPEC.md` / this document.

To add a new role: extend `ROLES`, `ROLE_PERMISSIONS` and `ROLE_LABELS` in the
shared permissions module. The seeder upserts roles and grants on boot.

To change auth or security policy: update `config/env.js` (defaults + production
checks), `.env.example`, and the relevant service, then verify `npm run test`.
