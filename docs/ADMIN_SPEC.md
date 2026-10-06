# Virallink — Admin Dashboard & Admin Backend Specification

Status: descriptive spec of the system **as built** (source of truth: the code).
Scope: the authenticated admin surface — the REST API in `apps/api` that serves it,
and the Next.js console in `apps/web/app/vira-admin`. The public marketing site is
out of scope except where it shares infrastructure.

---

## 1. System context

Two applications, one database, one machine:

```
Browser ──► Next.js (apps/web, port 3000)
              │  Server Components render admin pages
              │  fetch() over loopback with the caller's cookies
              ▼
           Express API (apps/api, 127.0.0.1:4000)
              │  session + permission checks per route
              ▼
           MySQL 8 via Sequelize 6
```

Invariants that hold everywhere below:

1. **The browser never talks to the API directly in production.** All admin calls go
   through Next.js (Server Components via `adminData()`, client mutations via the
   `/api/[...path]` forwarding route). `NEXT_PUBLIC_API_PUBLIC_URL` is empty in
   production for exactly this reason.
2. **The API is the only security boundary.** Everything the web app does — the
   proxy cookie check, `requireSession`, `requirePermission`, hiding nav links — is
   a usability measure. A forged cookie that passes those layers still gets 401/403
   from the API on every data call.
3. **One permission string is the contract** between `@virallink/shared/permissions`,
   the API middleware, and the sidebar renderer.

---

## 2. Backend specification (`apps/api`)

### 2.1 Stack and boot

- Express **5.2.1** (ESM, Node ≥ 20.9), Sequelize **6.37.8** / MySQL 8, `mysql2`.
- `jose` for JWTs, `bcrypt` for passwords, `zod` 4 for validation, `pino` for logs,
  `helmet` + `cors` + `express-rate-limit`, `multer` + `sharp` for media,
  `@aws-sdk/client-s3` for optional object storage.
- Boot order (`src/server.js`): validate env → assert DB connection →
  `bootstrapDatabase()` (pending migrations + RBAC seed, idempotent, serialised by
  an advisory lock so several Passenger workers can run it) → dev-only
  `syncSchema()` → listen. Migrations run **before** the listener opens, so a
  half-updated schema can never answer a request.
- Housekeeping interval (hourly): prune expired refresh tokens and the in-memory
  access-token blocklist.
- `GET /health` is mounted before rate limiting and reports `{status, database,
  uptime, version, env}` (503 when the DB is down).

### 2.2 Namespaces and routing rules

Mounted at `/api/v1` (`src/routes/index.js`):

| Namespace | Auth | Notes |
|---|---|---|
| `/api/v1/public/*` | none | allowlisted eager-loads only (`PUBLIC_INCLUDES`), `globalLimiter` |
| `/api/v1/contact` | none | the only unauthenticated write; rate limited + spam-scored |
| `/api/v1/auth/*` | mixed | see §2.3 |
| `GET /api/v1/media/*splat` | none | local-disk media serving; **mounted before** the admin router (load-bearing: the admin router owns the `/media` prefix, so mounting order decides which handler wins) |
| everything else | session | the admin router (`src/routes/v1/admin.routes.js`) |

The admin router is mounted at the **root** of the namespace so resource paths stay
clean (`/api/v1/employees`). It guards itself with two mechanisms:

1. **First-segment allowlist.** `ADMIN_RESOURCE_PREFIXES` (shared, frozen) decides
   which paths it owns; anything else falls through with `next('router')` so unknown
   paths produce a genuine 404 rather than a misleading 401. The same list is used
   by the web app's forwarding route, so a resource added on one side cannot 404
   silently on the other.
2. **`router.use(authenticate)`** placed above every handler — no admin route can
   be declared unauthenticated by accident.

ADMIN resource prefixes: `dashboard, company, employees, shareholders, clients,
services, portfolio, blog, inquiries, finance, activity, media, testimonials, stats,
jobs, departments, users, roles, tasks, deliverables, content, proposals`.

### 2.3 Authentication

**Tokens.** Two JWTs, different secrets, different lifetimes:

| Token | TTL | Secret | Persistence |
|---|---|---|---|
| access | 15 min (`JWT_ACCESS_TTL`) | `JWT_SECRET` | stateless + in-memory revocation blocklist |
| refresh | 30 days (`JWT_REFRESH_TTL`) | `JWT_REFRESH_SECRET` | row in `refresh_tokens` so sessions can be revoked server-side |

- Both are HS256, issuer `virallink-api`, carry `typ` (`access`|`refresh`) so a
  refresh token can never be replayed as an access token, plus `tv` (tokenVersion).
- Delivered as **httpOnly cookies** `vl_access` / `vl_refresh` (`sameSite=lax`,
  `secure` per env) *and* in the login response body for server-to-server callers.
- `requireAuth` re-reads the user + roles + permissions from the DB on **every
  request**: deactivating an account or changing a role takes effect immediately,
  and a `tokenVersion` mismatch (password/role change) kills outstanding tokens.
- Auth accepts `Authorization: Bearer` or the cookie, so both the browser and the
  Next route handlers work unchanged.

**Auth endpoints** (`/api/v1/auth`, rate-limited with `authLimiter` on the
sensitive ones):

| Method | Path | Purpose |
|---|---|---|
| GET | `/setup-status` | `{ needsSetup: boolean }` — whether any user exists. Unauthenticated by necessity; returns no enumerable data. |
| POST | `/setup` | creates the **first SUPER_ADMIN**; permanently 403 once any user exists (re-checked inside the insert to close the two-parallel-requests race) |
| POST | `/login` | bcrypt verify, issues the pair, records an activity log entry (success and failure) |
| POST | `/refresh` | rotates the refresh token (single-use); a failed refresh **clears the cookies** so a dead session lands on login instead of looping |
| POST | `/logout` | revokes the refresh token (optional `allSessions: true`), clears cookies |
| GET | `/me` | current user + resolved permission keys |
| POST | `/change-password` | revokes **all** sessions including the current one |
| POST | `/verify` | cheap signature check for proxy-style callers; not authoritative |

Login failures return one generic message so account existence is not revealed.

### 2.4 Authorization (RBAC)

- Permission keys are defined once in `@virallink/shared/permissions`
  (`PERMISSIONS`), seeded into `permissions` / `roles` / `role_permissions`.
- Roles: `SUPER_ADMIN` (holds every permission — never special-cased in code),
  `ADMIN`, `EDITOR`, `FINANCE`.
- Enforcement middleware (`src/middleware/rbac.js`):
  - `requirePermission(...keys)` — any-of; **declared per route**, next to the
    handler it protects, so a new endpoint cannot ship without one.
  - `requireAllPermissions(...keys)` — every-of, for cross-domain actions.
  - `requireRole(...roles)` — exists but discouraged; permissions are finer-grained.
  - `requireOwnership(fn)` — used for activity log scoping (`activity.read` sees
    everything, otherwise only your own entries).
- Status codes: **401** no session, **403** signed in but not permitted (logged at
  `warn` with userId/required/path), **422** unknown permission key in a route
  definition (a code bug).

**Permission catalogue** (grouped): `company.read/write`, `settings.read/write`,
`user.read/write`, `role.read/write`, `employee.read/write/delete`,
`shareholder.read/write/delete`, `client.read/write/delete`, `inquiry.read/write`,
`service.read/write/delete`, `project.read/write/delete`, `blog.read/write/delete`,
`testimonial.write`, `job.write`, `finance.read/write/delete`,
`media.read/write/delete`, `activity.read`, `activity.read_own`,
`task.read/write/delete/assign`, `content.read/write`.

**Role → capability summary**

| Role | Can do |
|---|---|
| SUPER_ADMIN | everything |
| ADMIN | company/settings, employees, clients, inquiries, services, portfolio, blog, testimonials, jobs, tasks (incl. delete), media, own activity — **no** finance, shareholders, roles, content pipeline |
| EDITOR | read-most, write services/portfolio/blog/testimonials/jobs, full content pipeline + tasks (no delete), media — no finance, no people records beyond read |
| FINANCE | finance full, read clients/inquiries/shareholders, tasks, media, full activity log |

Notable deliberate separations:

- `content.*` is separate from `client.*`: running the production board is day-to-day
  work and must not require the power to edit a contract value.
- Deliverables/metrics reuse `client.read/write` instead of a second `report.*`
  family, so there is only one way to grant access to client performance data.

### 2.5 Validation

- Shared Zod schemas live in `@virallink/shared/schemas`; route-level wrappers in
  `src/middleware/schemas.js` via `v('schemaName')` middleware, sourced from
  `body | query | params`.
- Sort fields are **whitelisted per endpoint** (`makeListQuerySchema([...fields])`)
  — a typo in `?sort=` is a 422, never a silently wrong order.
- `idFrom(request)` rejects non-numeric path ids before any query runs.
- Failed validation → **422** with `error.details` keyed by field path (arrays of
  messages), which the forms render inline.

### 2.6 Response envelope and error model

Success:

```json
{ "data": <payload>, "meta": { "page", "pageSize", "total", "totalPages" }, "totals": { } }
```

`meta` accompanies every list; `totals` only where aggregates exist (shareholders,
etc.). Money crosses the wire as **integer cents** for aggregates/reports and as
`DECIMAL` strings for raw columns; the client formats.

Error (`src/middleware/error.js`):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": { "field": ["…"] }, "requestId": "…" } }
```

| Status | Codes |
|---|---|
| 400 | `INVALID_JSON`, `INVALID_UPLOAD` |
| 401 | `UNAUTHORIZED` (no/invalid/expired/revoked session) |
| 403 | `FORBIDDEN` (permission missing; also setup-complete) |
| 404 | `NOT_FOUND` |
| 409 | conflict (e.g. duplicate email) |
| 413 | `PAYLOAD_TOO_LARGE`, `FILE_TOO_LARGE` |
| 422 | `VALIDATION_ERROR` |
| 500 | `INTERNAL_ERROR` — generic message + `requestId`; stack stays in the logs (`debug` field only outside production) |

### 2.7 Security controls

- **Helmet** with a strict CSP (`default-src 'self'`, no framing, HSTS in prod),
  referrer policy `strict-origin-when-cross-origin`, `crossOriginResourcePolicy:
  same-site`.
- **CORS**: explicit origin allowlist; `*` is rejected at boot in production;
  credentials enabled.
- **Rate limiting**: `globalLimiter` is mounted **only** on `/public` and
  `/contact` — the anonymous surface. Admin traffic is deliberately not IP-limited
  (it already requires a session + per-route permission, requests arrive over
  loopback, and one dashboard view fans out into many calls). `authLimiter`
  protects login/setup with a much tighter budget.
- **Body limits**: JSON/urlencoded capped at 1 MB; uploads capped by
  `MEDIA_MAX_BYTES`, ≤ 10 files, MIME allowlist in `fileFilter`.
- **Audit**: `ActivityLog` is append-only (no soft delete), written through
  `src/middleware/audit.js` + service hooks for login/login_failed/create/update/
  delete/publish/role_change/password_change/financial_*; aged out by the
  `prune:activity` job rather than edited by hand.
- **Privacy**: contact inquiries store a *salted HMAC* of the IP (`ipHash`), never
  the raw address.

### 2.8 Route catalogue

All routes below are behind `authenticate`; the permission shown is enforced by
`requirePermission` on the route itself. Validation middleware is omitted for
brevity but present on every mutating route (`v('…')`).

**Dashboard & company**

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard/summary` | `client.read` |
| GET | `/company` | `company.read` |
| PUT | `/company` | `company.write` |
| PUT | `/company/social-links` | `company.write` |

**Employees & departments**

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/employees` | `employee.read` / `employee.write` |
| GET/PUT/DELETE | `/employees/:id` | `employee.read` / `employee.write` / `employee.delete` |
| POST | `/employees/reorder` | `employee.write` |
| GET/POST | `/departments` | `employee.read` / `employee.write` |

**Shareholders** (confidential — no public counterpart)

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/shareholders` | `shareholder.read` / `shareholder.write` |
| GET/PUT/DELETE | `/shareholders/:id` | `shareholder.read` / `shareholder.write` / `shareholder.delete` |

**Clients**

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/clients` | `client.read` / `client.write` |
| GET/PUT/DELETE | `/clients/:id` | `client.read` / `client.write` / `client.delete` |
| POST | `/clients/:id/notes` | `client.write` |
| POST | `/clients/:id/communications` | `client.write` |
| GET | `/clients/:id/report` | `client.read` |
| GET | `/clients/:id/totals` | `client.read` |

**Public content: services, portfolio, blog**

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/services` | `service.read` / `service.write` |
| GET/PUT/DELETE | `/services/:id` | `service.read` / `service.write` / `service.delete` |
| POST | `/services/reorder` | `service.write` |
| GET/POST | `/portfolio` | `project.read` / `project.write` |
| GET/PUT/DELETE | `/portfolio/:id` | `project.read` / `project.write` / `project.delete` |
| POST | `/portfolio/reorder` | `project.write` |
| GET/POST | `/blog` | `blog.read` / `blog.write` |
| GET/PUT/DELETE | `/blog/:id` | `blog.read` / `blog.write` / `blog.delete` |
| GET/POST | `/blog/categories`, `/blog/tags` | `blog.read` / `blog.write` |

**Inquiries**

| Method | Path | Permission |
|---|---|---|
| GET | `/inquiries` | `inquiry.read` |
| GET | `/inquiries/:id` | `inquiry.read` |
| PUT | `/inquiries/:id` | `inquiry.write` |
| POST | `/inquiries/:id/archive` | `inquiry.write` |

**Finance**

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/finance/transactions` | `finance.read` / `finance.write` |
| PUT/DELETE | `/finance/transactions/:id` | `finance.write` / `finance.delete` |
| GET/POST | `/finance/categories` | `finance.read` / `finance.write` |
| GET/POST | `/finance/invoices` | `finance.read` / `finance.write` |
| GET/PUT | `/finance/invoices/:id` | `finance.read` / `finance.write` |
| POST | `/finance/payments` | `finance.write` |
| DELETE | `/finance/payments/:id` | `finance.delete` |
| GET | `/finance/reports` | `finance.read` |

**Media, branding, jobs**

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/media` | `media.read` / `media.write` |
| PUT/DELETE | `/media/:id` | `media.write` / `media.delete` |
| GET/POST/PUT/DELETE | `/testimonials`… | `testimonial.write` (reads included) |
| GET/POST/PUT/DELETE | `/stats`… | `company.read` / `company.write` |
| GET/POST/PUT/DELETE | `/jobs`… | `job.write` (reads included) |

**Users & roles**

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/users` | `user.read` / `user.write` |
| PUT/DELETE | `/users/:id` | `user.write` |
| GET | `/roles` | `role.read` |

**Tasks**

| Method | Path | Permission |
|---|---|---|
| GET | `/tasks`, `/tasks/summary`, `/tasks/:id` | `task.read` |
| POST/PUT | `/tasks`, `/tasks/:id` | `task.write` |
| DELETE | `/tasks/:id` | `task.delete` |

**Client reporting: deliverables & metrics**

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/deliverables` | `client.read` / `client.write` |
| PUT/DELETE | `/deliverables/:id` | `client.write` |
| POST | `/deliverables/metrics` | `client.write` (upsert: same client+month returns 200, new row 201) |
| DELETE | `/deliverables/metrics/:id` | `client.write` |

**Content production pipeline**

| Method | Path | Permission |
|---|---|---|
| GET | `/content/board` | `content.read` |
| GET | `/content/cycle-time` | `content.read` |
| GET | `/content/weekly` | `content.read` |
| PUT | `/content/:id` | `content.write` |
| POST | `/content/:id/stage` | `content.write` (records a stage-history entry) |
| GET | `/content/:id/history` | `content.read` |
| GET | `/proposals`, `/proposals/summary` | `content.read` |
| POST/PUT/DELETE | `/proposals`… | `content.write` |

**Audit**

| Method | Path | Permission |
|---|---|---|
| GET | `/activity` | `activity.read` (or `activity.read_own` scoping via `requireOwnership`) |

### 2.9 Service layer

Routes are thin; logic lives in `src/services/`:

| Service | Responsibility |
|---|---|
| `auth.service.js` | login/refresh/logout, password change, cookie options, `toPublicUser` |
| `token.service.js` | JWT sign/verify, revocation blocklist, `requireAuth`, `optionalAuth` |
| `admin.service.js` | CRUD for company, employees, shareholders, clients, services, portfolio, blog, inquiries, finance, media, branding, users — plus activity logging on each mutation |
| `dashboard.service.js` | `/dashboard/summary` aggregations + finance report (all SQL-side, cached per section) |
| `report.service.js` | deliverables, monthly metrics, per-client report/totals |
| `pipeline.service.js` | content board, stage moves + history, cycle time, weekly report, proposals |
| `task.service.js` | task CRUD, summaries, assignment |
| `user.service.js` | user/role assignment |
| `media.service.js` | upload validation (sharp decode), transform, local/S3 storage, `readMedia` |
| `public.service.js` / `inquiry.service.js` | public reads and contact intake (not admin, listed for completeness) |

Cross-cutting utilities: `utils/money.js` (cents conversion, `sumCents`,
`outstandingCents`), `utils/cache.js` (blocklist + `cached()` helper),
`utils/AppError.js`.

### 2.10 Domain model (admin-relevant tables)

Sequelize models are declared in `src/models/definitions.js` (pure data) and
registered with the association graph in `src/models/index.js`. All tables use
`underscored` columns, `created_at`/`updated_at`, and soft delete (`deleted_at`,
`paranoid`) unless noted.

| Group | Tables |
|---|---|
| Identity & access | `permissions`, `roles`, `role_permissions`, `users`, `user_roles`, `refresh_tokens` |
| People | `departments`, `employees`, `shareholders` |
| Clients & work | `clients`, `client_notes`, `client_communications`, `projects`, `project_images`, `technologies`, `project_technologies` |
| Public content | `services`, `blog_posts`, `blog_categories`, `blog_tags` (+ join tables), `testimonials`, `company_stats`, `jobs`, `social_links`, `company` |
| Finance | `financial_categories`, `financial_transactions`, `invoices`, `invoice_items`, `payments` |
| Production pipeline | `content_deliverables`, `content_metrics`, `content_stage_events`, `client_proposals`, `tasks` |
| Media | `media` |
| Leads & audit | `contact_inquiries`, `activity_logs` (append-only — no soft delete, no updates) |

Key column rules:

- **Money**: `DECIMAL(14,2)`, never float; Sequelize returns strings, services
  convert to integer cents before arithmetic.
- **Ids**: `BIGINT UNSIGNED` auto-increment.
- **Uniqueness**: e.g. `blog_posts.slug`, `permissions.key`, `users.email`.
- Indexes are declared with **column** names (the registry maps attribute → column,
  because MySQL receives model-level index definitions untranslated).

### 2.11 Media pipeline

1. `multer` holds uploads **in memory** (no temp file, never in the document root),
   capped by `MEDIA_MAX_BYTES`, ≤ 10 files, MIME allowlist.
2. `media.service.js` re-decodes each file with `sharp` — the declared MIME is
   never trusted — generates variants, then writes to local disk (`MEDIA_ROOT`) or
   S3 depending on `STORAGE_DRIVER`.
3. Filenames are **content-addressed**, so `GET /media/:year/:month/:file` can be
   cached `immutable` for a year. The key is pattern-validated before any
   filesystem access (traversal guard).
4. With `STORAGE_DRIVER=s3` the serving route is unused — the object store serves
   files directly.

---

## 3. Admin dashboard specification (`apps/web/app/vira-admin`)

### 3.1 Access gate layers

Four independent layers; each is labelled in the code as a convenience, with the
API as the real boundary:

1. **`proxy.js`** (Next request interceptor) — if the `vl_access` cookie is
   *absent*, redirect to `/vira-admin/login?next=…`. Deliberately does not verify
   the token (no DB round trip in a layer that is easy to bypass). Matcher
   excludes `/vira-admin/login` to avoid a redirect loop.
2. **`(protected)/layout.js`** — `requireSession()` server-side; no session →
   redirect to login. Renders `<AdminShell>` (no public header/footer/nav).
3. **`requirePermission('…')` per page** — redirects to the dashboard if the
   session lacks the permission. Cosmetic: avoids showing an unusable page.
4. **The API** — every data call independently returns 401/403.

Anti-indexing (three layers): page/layout `metadata.robots = noindex`, the
`robots.txt` Disallow rule, and `X-Robots-Tag` headers from `next.config.mjs` /
`.htaccess`. The login page is intentionally a public URL; it exposes nothing.

### 3.2 Authentication UX

- `/vira-admin/login` — server component. If a session already exists → redirect
  to dashboard. Calls `GET /auth/setup-status`: on a fresh install it renders
  `SetupForm` (first-run SUPER_ADMIN creation) instead of the login form; the API
  independently refuses once any user exists.
- `LoginForm` posts to the app's own `/api/auth/login` route handler (one of the
  four auth forwarders: `login`, `logout`, `refresh`, `setup`, each proxying to
  `/api/v1/auth/*` server-side with the cookies attached),
  then does a **full navigation** to the target so server components re-read the
  new cookie. `?next=` is validated to be same-origin (open-redirect guard).
- Stale-cookie notice: a present-but-dead `vl_access` shows a warning that signing
  in will replace it.
- Error copy is verbatim from the API — one generic message for bad email/password.

### 3.3 Shell and navigation

`AdminShell` (client component; session passed from the layout, never fetched in
the browser):

- Layout: `grid-cols-[16rem_1fr]`; sticky sidebar on desktop, drawer on mobile.
- Sidebar items come from `ADMIN_NAV` in `@virallink/shared/permissions`,
  **filtered by the session's permission set**. Groups with no visible children
  are dropped. Hiding is cosmetic — the API enforces the same permissions.
- Header: page title context + `UserMenu` (initials avatar, role label,
  permission count, sign-out → `POST /api/auth/logout` + full refresh).

Sidebar structure (permission in brackets):

| Group | Items |
|---|---|
| — | Dashboard `/vira-admin/dashboard` (exact match) |
| — | Tasks `[/task.read]` |
| Production | Pipeline board `[/content.read]`, Weekly report `[/content.read]`, Proposals `[/content.read]` |
| Content | Services `[/service.read]`, Portfolio `[/project.read]`, Blog `[/blog.read]`, Inquiries `[/inquiry.read]` |
| People | Employees `[/employee.read]`, Clients `[/client.read]`, Shareholders `[/shareholder.read]` |
| Finance `[/finance.read]` | Transactions, Invoices, Reports |
| System `[/settings.read]` | Company `[/company.read]`, Media `[/media.read]`, Users & roles `[/user.read]`, Activity log `[/activity.read]` |

### 3.4 Page inventory

Route group `(protected)` — 22 pages, all server components, all `force-dynamic`:

| Route | Page | Guard |
|---|---|---|
| `/vira-admin/dashboard` | Dashboard | `client.read` |
| `/vira-admin/tasks` | Task board | `task.read` |
| `/vira-admin/content` | Pipeline board (kanban) | `content.read` |
| `/vira-admin/content/weekly` | Weekly production report | `content.read` |
| `/vira-admin/content/proposals` | Proposals | `content.read` |
| `/vira-admin/services` | Services list | `service.read` |
| `/vira-admin/portfolio` | Portfolio list | `project.read` |
| `/vira-admin/blog` | Blog list | `blog.read` |
| `/vira-admin/inquiries` | Inquiry inbox | `inquiry.read` |
| `/vira-admin/employees` | Employees list | `employee.read` |
| `/vira-admin/clients` | Clients list | `client.read` |
| `/vira-admin/clients/[id]` | Client detail | `client.read` |
| `/vira-admin/clients/[id]/report` | Client performance report | `client.read` |
| `/vira-admin/shareholders` | Shareholders list | `shareholder.read` |
| `/vira-admin/finance/transactions` | Transactions | `finance.read` |
| `/vira-admin/finance/invoices` | Invoices | `finance.read` |
| `/vira-admin/finance/reports` | Finance reports | `finance.read` |
| `/vira-admin/settings/company` | Company profile | `company.read` |
| `/vira-admin/settings/media` | Media library | `media.read` |
| `/vira-admin/settings/users` | Users & roles | `user.read` |
| `/vira-admin/activity` | Activity log | `activity.read` |

### 3.5 Data-fetching pattern

Server pages call `adminData(path)` (`(protected)/lib/adminData.js`):

- Builds the cookie header from `vl_access`/`vl_refresh`, fetches
  `API_INTERNAL_URL/api/v1<path>` over loopback, `cache: 'no-store'`, 8 s
  `AbortSignal` timeout (an unreachable API must not hang a render into a memory
  kill on shared hosting).
- Returns `{ ok, status, data, meta, totals, error, isEmpty }` — **never throws**.
  Pages render purposeful states instead of an error boundary:
  - `ok: false, status: 403` → "Your role does not have permission…"
  - `ok: false` otherwise → "The management service did not respond."
  - `isEmpty` → empty state with guidance ("Nothing appears on the website until
    you publish it")
- `meta` defaults to `{ page: 1, pageSize: 20, total: 0, totalPages: 0 }`.
- Client components mutate through the app's `/api/[...path]` forwarder (which
  forwards only `ADMIN_RESOURCE_PREFIXES` paths) and then `router.refresh()`.
- Search/filter state lives in the **URL query string**; pagination and filters
  survive navigation and are shareable.

### 3.6 The list-page factory

Nine structurally identical modules (search + filter + paginate + create + edit +
publish + delete) are generated by `createAdminListPage(config)` in
`(protected)/createListPage.js`. Config: `title, description, resource,
permission, permissionFor, columns, searchFields?, filters, publishable, itemName,
icon, form`. Hand-written pages are only the genuinely unusual ones (dashboard,
finance reports, company settings, boards, detail views).

Column `kind` renderers (`KINDS`): `text` (degrades objects to `name/title`,
missing to `—`), `primary` (+ secondary line), `status`, `publish`, `date`,
`boolean`, `money`, `link`. Each row renders `PublishToggle` (when publishable),
`form.EditTrigger`, and `DeleteButton` (with confirm).

Shared table furniture: `AdminToolbar` (search + filters as URL params),
`AdminPagination` (driven by `meta`), `TableEmpty`.

### 3.7 Component inventory (`components/admin/`)

| Component | Role |
|---|---|
| `AdminShell` | sidebar + header + user menu |
| `AdminUI` | `AdminHeader`, `AdminPanel`, `StatCard`, `Toolbar`, `TableWrapper/Th/Td`, `Skeleton`, `TableSkeleton`, `BackToDashboard` |
| `AdminTableParts` | `AdminToolbar`, `AdminPagination`, `TableEmpty` |
| `Badge` | `StatusBadge`, `DateCell` (relative option), `MoneyCell`, `NumberCell`, `BooleanBadge` |
| `charts.js` | `FinanceTrendChart` (a chart only where direction over time adds meaning) |
| `DeleteButton` | `DeleteButton`, `PublishToggle` with confirm step |
| `ConfirmDialog` | destructive-action confirmation |
| Form dialogs | `ClientFormDialog`, `CompanyFormDialog`, `EmployeeFormDialog`, `ServiceFormDialog`, `ProjectFormDialog`, `BlogFormDialog`, `TaskFormDialog`, `InvoiceFormDialog`, `TransactionFormDialog`, `ShareholderFormDialog`, `UserFormDialog`, `DeliverableFormDialog`, `MetricFormDialog`, `ProposalFormDialog`, `NewContentCardDialog` |
| Domain views | `ContentBoard` (kanban + stage moves), `ContentDetailDialog`, `ClientReportView`, `ReportExportButtons`, `ClientActivityForms`, `SetupForm` |

Forms surface 422 `error.details` inline per field and 403 as a permission
notice.

### 3.8 Dashboard page (spec)

`GET /dashboard/summary` returns eight independently-computed (and cached)
sections, all aggregates executed as SQL:

```jsonc
{
  "counts":     { "clients": {total, active}, "projects": {total, active, completed},
                  "employees", "shareholders", "inquiries": {unread}, … },
  "finance":    { "lifetime": {incomeCents, expenseCents, …}, "month": {…}, … },
  "trends":     [ { month, incomeCents, expenseCents } ],        // 12 months
  "statusBreakdown": { "projects": [{status, count}], "clients": [{status, count}] },
  "recentActivity":  [ { id, action, entity, createdAt } ],      // 8
  "recentInquiries": [ … ],                                      // 5
  "deadlines":   [ { type: "project"|"invoice", label, dueDate, status, outstandingCents } ],
  "serviceDistribution": [ … ]
}
```

Page layout, in order:

1. `AdminHeader` + first-run banner when everything is empty (guidance, not zeros).
2. Four `StatCard`s: active clients, active projects, employees, unread inquiries —
   each linking to its module.
3. Finance panel: month/lifetime figures + `FinanceTrendChart` (the one place a
   chart earns its space).
4. Two feeds: recent inquiries and recent activity (human phrasing per
   `ACTIVITY_ACTION`), plus upcoming deadlines.
5. Composition: projects-by-status and clients-by-status lists (only when data
   exists).

Design rule stated throughout the code: **figures by default, charts only where
trend carries meaning a number cannot.**

### 3.9 Cross-cutting UI behaviour

- **Loading**: `TableSkeleton`/`Skeleton` keep layout stable while data loads.
- **Empty**: `TableEmpty`/`EmptyState` distinguishes "no filters match" from
  "nothing yet", with a next action.
- **Permission-denied**: explicit notice (403) rather than a stack trace.
- **API-down**: explicit "management service did not respond" notice; never
  rendered zeros that would look like an inactive business.
- **Destructive actions**: always through `ConfirmDialog`; deletes are soft
  (paranoid) except the append-only audit log.
- **Publishing**: content is `is_published`-gated; nothing reaches the public site
  until published, so the admin can build privately.
- **Accessibility**: semantic tables with `scope="col"`, `aria-current` on active
  nav, `aria-expanded` on menus, labelled form fields with per-field errors,
  dialogs with roles.

---

## 4. Adding a new admin resource — checklist

The codebase has been burned by drift between the two apps (the `deliverables`
404 incident), so extension must touch **shared** code:

1. `packages/shared/src/enums.js` — add enum values/labels if needed.
2. `packages/shared/src/permissions.js` — add permission keys, grant them in
   `ROLE_PERMISSIONS`, add the path prefix to `ADMIN_RESOURCE_PREFIXES`, add the
   sidebar entry to `ADMIN_NAV`.
3. `packages/shared/src/schemas.js` — Zod schemas for body/query; whitelist sort
   fields.
4. `apps/api/src/models/definitions.js` (+ registry associations) — table.
5. `apps/api/src/migrations/` — migration (boot applies it automatically).
6. `apps/api/src/services/…` — service functions; write audit logs on mutations.
7. `apps/api/src/routes/v1/admin.routes.js` — routes with `requirePermission`
   **and** `v('…')` on every route.
8. `apps/web/app/vira-admin/(protected)/…` — page via `createAdminListPage` (or
   hand-written), guard with `requirePermission`.
9. `apps/web/components/admin/…` — form dialog if the factory's config needs one.
10. Tests: `apps/api/test` (money + isolation suites) and the shared permission
    coverage test that asserts nav permissions are real permission keys.

---

## 5. Known limitations / deliberate trade-offs

- **No CSRF token.** Mitigated by `SameSite=Lax` cookies, the CORS allowlist, and
  JSON-only body parsing (`Content-Type` enforced); state-changing routes are not
  CSRF-token-protected.
- **Single-process assumptions.** The token blocklist and housekeeping interval
  are in-memory — correct for the current single Passenger app, would need Redis
  (or similar) before running multiple API instances.
- **`GET /dashboard/summary` is gated on `client.read` as a proxy permission**, and
  the Dashboard nav entry carries no permission. That works today only because all
  four seeded roles hold `client.read`. Any future role without it would see the
  Dashboard link and then a 403 notice page — worth revisiting if a role that
  cannot read clients is ever added.
- **Page permission checks are cosmetic by design** — duplicated deliberately so a
  user never sees a page that will 403, at the cost of keeping the page guard and
  the route permission in sync by hand.
- **`activity.read_own` vs `activity.read`** — the sidebar only exposes the log
  for `activity.read`; `ADMIN` holds `activity.read_own` and therefore sees no log
  link, though the endpoint honours the scoped variant.

---

*Generated from the codebase at commit `0eadf73` (branch `second`).*







