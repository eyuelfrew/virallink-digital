# Virallink — Architecture Proposal (Phase 0)

Status: **approved, implementation in progress.**

Two constraints confirmed by the client and applied throughout:

- **JavaScript only.** No TypeScript anywhere. No `.ts`/`.tsx` files, no type
  checking step, no `tsconfig.json`. Path aliases are configured with
  `jsconfig.json` instead. The `packages/shared` module is plain ESM JavaScript.
- **Deploys to cPanel.** Shared hosting, not a VPS. This invalidates the Nginx /
  Docker / PM2 / Redis assumptions in the original brief. The target stack is
  Apache or LiteSpeed (cPanel's default) fronting two "Setup Node.js App"
  applications managed by Passenger, plus MySQL via phpMyAdmin. Reversion of that
  decision is captured in section 9.

---

## 1. Logo analysis

Measured directly from `image.avif` (not eyeballed):

| Property | Value |
| --- | --- |
| Format / size | HEIF/AVIF, **96 × 58 px**, `hasAlpha: true` |
| Dominant blue | `#025298` (~35% of non-transparent pixels) |
| Dominant gold | `#f9a71b` / `#e0a844` (~12%) |
| Transparent pixels | ~38% (rendered black when alpha is stripped) |

Form: a **VP monogram** in heavy geometric sans (the V and P share a single
continuous stroke, giving it a custom-built rather than typeset feel). A
**stylised dove with an olive branch** is drawn in gold line-art, descending
diagonally across the letterforms, and a gold arc sweeps underneath as a
baseline. Wordmark "Virallink" sits below in an italic-ish sans with tracking.

### Design direction derived from it

- **Colour.** Blue `#025298` is the primary identity colour; gold `#f9a71b` is the
  accent only — highlights, active states, one CTA per viewport. Neutrals are
  near-black `#0B0F14` ink on white, `#F7F8FA` surface. Blue deepens to
  `#013B75` for hover/pressed, never a gradient. Gold on white fails contrast, so
  gold is never used for body text or form labels.
- **Contrast.** The logo is high-contrast (dark blue mass on white). The site
  mirrors that: dark ink surfaces for hero/footer bands, white content sections.
  No soft pastel washes.
- **Typography direction.** The monogram is a bold, slightly condensed geometric
  sans. Display type: `Sora` or `Plus Jakarta Sans` (geometric, confident, not
  Inter-generic). Body: `Inter`. Mono for metrics: `JetBrains Mono` in the
  dashboard only. Scale uses a fluid clamp so headings do not balloon.
- **Visual character.** Structural and engineered, not playful. Rules are 1px and
  crisp, corners are `6px`/`10px` (never fully rounded pills), shadows are rare and
  tight. Motion is short (150–400ms), used for reveals on scroll and route
  transitions only.
- **Tone.** Ethiopian business, international delivery. No stock photography of
  smiling people; imagery is product work, typography and layout that carry the page.
- **Logo usage.** Redraw not permitted. We will use the provided asset as the
  master, converted to optimised PNG/WebP at multiple sizes. **Action needed:** the
  source is 96×58, which is unusable above 96 CSS px and will look soft on retina.
  A vector (SVG) or ≥1200px-wide PNG is required before production. This does not
  block the build; I will wire the asset through a `BrandAsset` config so it can be
  swapped without code changes.

---

## 2. Repository layout

Monorepo with npm workspaces. One deployable per app, plus a shared package for
the pieces both sides need (enums, validation schemas, permission names). Two
processes keeps Nginx, PM2 and the SEO surface simple.

```
virallink/
├─ apps/
│  ├─ web/                     Next.js 16.3 (App Router, JavaScript, Tailwind 4)
│  └─ api/                     Express 5.2 + Sequelize 6.37
├─ packages/
│  └─ shared/                  enums, zod schemas, permission map, SEO helpers
├─ storage/                    local media (gitignored; S3-ready interface)
├─ docs/                       ERD, API reference, runbook
└─ nginx/                      site + api vhost, TLS, caching rules
```

Versions pinned from the registry today: `next@16.3.8`, `react@19.3.0`,
`tailwindcss@4.3.3`, `express@5.2.1`, `sequelize@6.37.8`, `mysql2@3.24.5`,
`zod@4.6.5`, `jose@6.2.12`, `bcrypt@6.0.0`, `helmet@8.3.0`,
`express-rate-limit@8.7.0`, `motion@13.4.6`, `lucide-react@1.49.0`,
`recharts@3.10.1`, `sharp@0.35.5`, `pino@10.3.1`.

### apps/web

```
src/
├─ app/
│  ├─ (public)/                route group; owns public metadata + sitemap
│  │  ├─ page.js               home
│  │  ├─ about/page.js
│  │  ├─ services/page.js      services/[slug]/page.js
│  │  ├─ portfolio/page.js     portfolio/[slug]/page.js
│  │  ├─ clients/page.js  team/page.js
│  │  ├─ blog/page.js      blog/[slug]/page.js
│  │  ├─ contact/page.js  careers/page.js  privacy/page.js  terms/page.js
│  ├─ admin-teftef/            route group; noindex, authenticated
│  │  ├─ login/page.js
│  │  ├─ (protected)/layout.js + per-module pages + _components/
│  ├─ api/auth/                Next route handlers: session cookie issue/clear only
│  ├─ robots.js  sitemap.js  manifest.js  icon assets
│  └─ layout.js  not-found.js  error.js  global-error.js  loading.js
├─ components/{ui,site,admin,seo,forms}
├─ lib/{api,seo,auth,utils,constants,format}
├─ hooks/
└─ proxy.js                    redirect gate only (Next 16 renamed middleware)
```

Public pages are Server Components and read through `lib/api` (server-side
fetcher with Next cache tags). Client components are limited to: contact form,
mobile nav, cookie-free counters, and admin tables/filters/charts.

### apps/api

```
src/
├─ config/        env.js (zod-validated), database.js, logger.js, storage.js, constants.js
├─ models/        one file per model + index.js
├─ migrations/    seeders/
├─ routes/        v1 routers
├─ controllers/   thin: parse → call service → respond
├─ services/      business logic, DB transactions
├─ middleware/    auth, rbac, validate, rateLimit, upload, error, requestId, audit
├─ validators/    zod schemas per resource
├─ utils/         pagination, slugify, money, asyncHandler, AppError
├─ jobs/          optional (no queue unless needed)
└─ app.js  server.js  config/index.js
```

Express 5 note: it handles rejected promises in handlers, so `asyncHandler`
wrappers are unnecessary; `path-to-regexp` v8 requires named wildcards (`/*splat`)
so `*` route patterns change.

---

## 3. Data model (ERD)

Conventions: `BIGINT UNSIGNED` PKs, `VARCHAR(191)` unique/indexed utf8mb4 columns
(767-byte index limit), `DECIMAL(14,2)` for money, `TIMESTAMP`/`DATETIME(3)` for
audit columns, soft delete via `deleted_at`, no `sequelize.sync({ alter })`.

**cPanel MySQL limit.** Shared-hosting MySQL caps a single table at ~500 rows in
some configurations and caps total DB size by plan. Tables are therefore kept
narrow (no duplicate text blobs; `activity_logs.metadata` is JSON, not TEXT) and
indexed on the columns the admin tables actually filter by. Migrations are
written to be re-runnable-safe and small in count so they fit typical cPanel
phpMyAdmin import limits.

```
users ──< user_roles >── roles ──< role_permissions >── permissions
users ──< activity_logs
users ──< blog_posts (author_id)
users ──< contact_inquiries (assigned_to_id)

companies (1 row, singleton)
  ├─< social_links
  ├─< company_stats
  └─< testimonials
  └─< jobs (careers)

employees
employees ──< employee_social_links
employees >── departments (department_id)

shareholders ──> shareholders  (parent_id, self ref for holdings)

clients
  ├─< projects (client_id, service_id)
  │     ├─< project_images
  │     └─< project_technologies >── technologies
  ├─< invoices (client_id, project_id)
  │     └─< payments (invoice_id)
  ├─< client_notes
  ├─< client_communications
  └─ status ENUM(prospect, active, inactive, churned); source ENUM

services (parent_id for sub-services)
  └─ icon, image_media_id, sort_order, is_published

blog_posts ──< blog_post_categories >── blog_categories
blog_posts ──< blog_post_tags >── blog_tags
blog_posts ──> featured_media_id

media  (polymorphic owner, local path or S3 key, width/height/mime/size, blurhash)

financial_transactions (type income|expense, amount DECIMAL, currency, category_id,
                        client_id?, project_id?, trans_date, method, reference,
                        status, notes, created_by)
financial_categories (type-scoped, system vs custom)

contact_inquiries (status new|contacted|qualified|converted|closed, is_read,
                   assigned_to_id, spam_score, honeypot, ip_hash, utm fields)

activity_logs (user_id, action, entity, entity_id, ip, user_agent, metadata JSON,
               created_at; indexed on (entity, entity_id) and created_at)
```

Notes on specific rules from the brief:

- **Money** — `DECIMAL(14,2)`; Sequelize `DECIMAL` returns strings, so all
  arithmetic goes through `utils/money.js` using integer minor units. No floats.
- **Shareholders** — never exposed on a public route. The public API has no
  shareholder endpoint at all; only an authenticated admin one.
- **Employee privacy** — public select set is an explicit allowlist
  (`name, position, department, bio, photo, linkedin, display_order`). Email,
  phone and salary are admin-only columns and are not on any public serializer.
- **Testimonials / stats / clients** — each row has an `is_public` +
  `is_featured` flag; no row renders publicly without both being satisfied by
  admin action. No seed data will claim to be real.

Migration order: `permissions → roles → users → companies → departments →
employees → shareholders → clients → services → media → projects →
financial_* → invoices/payments → blog_* → contact_inquiries → activity_logs →
social_links/testimonials/stats/jobs`, then indexes and FK constraints.

---

## 4. Public routes

```
/                      home
/about                 mission, values, story, leadership preview
/services              index (published, ordered)
/services/[slug]       Service schema, related projects, FAQ
/portfolio             filterable grid, client + service facets
/portfolio/[slug]      Project/CreativeWork schema, challenge/solution/results
/clients               logos of opted-in clients, no fake logos
/team                  public employees grouped by department
/blog  /blog/category/[slug]  /blog/tag/[slug]  /blog/[slug]   Article schema
/contact               form + details + LocalBusiness/Contact schema
/careers               open roles from DB
/privacy  /terms       static-ish, admin-editable
/admin-teftef/*        never in nav, sitemap, or internal links
```

Every list page handles `?page=` and returns `loading.js` / `error.js` /
empty states. Slugs are unique per entity and generated by `slugify` from the
title, editable by an admin.

---

## 5. Admin routes and permission system

```
/admin-teftef/login  (public-but-noindex)
/admin-teftef/                 → dashboard
             /employees  /employees/[id]
             /shareholders
             /clients     /clients/[id]
             /services    /services/[id]
             /portfolio   /portfolio/[id]
             /blog        /blog/new  /blog/[id]
             /inquiries   /inquiries/[id]
             /finance     /finance/transactions  /finance/invoices  /finance/reports
             /activity
             /settings    /settings/company  /settings/team  /settings/media
```

`/admin-teftef` and everything under it is one route group. A `robots.js` plus
`robots.txt` disallow it, every admin page exports
`metadata: { robots: { index: false, follow: false, nocache: true } }`, and the
Nginx vhost also emits `X-Robots-Tag: noindex, nofollow` for that prefix.
`proxy.js` performs a cheap cookie-presence check and redirects to
`/admin-teftef/login?next=...`; the real session verification and RBAC happen in
the server-side data layer and the API. A missing/forged cookie gets no data.

RBAC is a permission matrix in `packages/shared/permissions.js`, seeded into the
DB and enforced by API middleware:

| Permission | SUPER_ADMIN | ADMIN | EDITOR | FINANCE |
| --- | --- | --- | --- | --- |
| company.* / settings.* | ✓ | ✓ | – | – |
| employees.read/write | ✓ | ✓ | read | – |
| shareholders.* | ✓ | – | – | read |
| clients.* | ✓ | ✓ | read | read |
| services.* / portfolio.* / blog.* | ✓ | ✓ | ✓ | – |
| finance.* | ✓ | – | – | ✓ |
| activity.read | ✓ | ✓ | own | ✓ |
| users / roles | ✓ | – | – | – |

Denials are enforced in `requirePermission('finance.write')` on the router, not in
UI. Hiding a nav item is cosmetic only. Status codes are 401 for missing session,
403 for insufficient role, and validation failures return a field-keyed 422.

---

## 6. API design

`/api/v1`, JSON, envelope `{ data, meta: { page, pageSize, total, pages } }`,
errors `{ error: { code, message, details } }`. Zod validation per route,
`?page`, `?search`, `?sort`, `?filter[field]=`, whitelist-only sort columns.

```
POST   /auth/login  /auth/logout  /auth/refresh  GET /auth/me  POST /auth/change-password
GET    /company              public, single row
GET    /public/services      published only
GET    /public/services/:slug
GET    /public/portfolio     GET /public/portfolio/:slug
GET    /public/team          allowlisted employee fields only
GET    /public/clients       opted-in logos only
GET    /public/blog          GET /public/blog/:slug
POST   /contact              rate limited, honeypot, spam score
CRUD   /employees  /shareholders  /clients  /services  /portfolio  /blog
CRUD   /finance/transactions  /finance/invoices  /finance/payments  /finance/categories
GET    /finance/reports/summary?from=&to=
GET    /dashboard/summary
GET    /activity             filtered, paginated
POST   /media  DELETE /media/:id
GET/PUT /settings/company
```

Public reads are a separate namespace (`/public/*`) built from public-safe
selectors, so a private field cannot leak through a shared query. Everything else
requires a session. Tokens: short-lived access JWT (`jose`, 15 min) + rotating
refresh token in an `httpOnly`, `secure`, `SameSite=Lax` cookie; `jti` in the DB
for revocation. Passwords hashed with `bcrypt` cost 12. Helmet, CORS allowlist,
rate limits (global 300/15min, `auth` 10/15min, `contact` 5/hour), 10 MB body
cap, file upload restricted by sniffed MIME + magic bytes via `sharp`.

Audit logging runs in one place (`middleware/audit.js`) so every mutation writes
an `activity_logs` row with user, action, entity, id, IP and a redacted metadata
diff. Secrets, password fields and file buffers are never stored in metadata.

---

## 7. SEO architecture

- **Server Components fetch and render.** No client-side data fetching on public
  pages, so HTML is complete for crawlers on first paint.
- **Metadata** — `layout.js` exports a title template
  `%s | Virallink`; each page exports `generateMetadata` composing title, meta
  description, canonical (`metadataBase` + path), Open Graph, Twitter card, and
  `alternates.canonical`. Descriptions come from the DB (`seo_description` column)
  and fall back to a meta-description generator that truncates on word boundary.
- **JSON-LD** — `components/seo/JsonLd.js` renders typed blocks: `Organization`
  and `LocalBusiness` (name, logo, address, geo, hours, contactPoint, `sameAs`),
  `WebSite` + `SearchAction` for the blog, `Service` per service page,
  `CreativeWork` for portfolio, `Article` (headline, image, datePublished,
  dateModified, author, publisher) for posts, `BreadcrumbList` on every
  sub-page, `FAQPage` when an admin has added FAQs. Admin responses are never
  serialized into public pages.
- **`app/sitemap.js`** builds sitemap index + children from the DB (only
  published content), `app/robots.js` emits `Disallow: /admin-teftef` and
  `/admin-teftef`, `Disallow: /api/`. Nginx adds the `X-Robots-Tag` header as a
  third layer.
- **Performance** — `next/image` with AVIF/WebP, explicit `sizes`, blur
  placeholders, fonts via `next/font` self-hosted with `display: swap`, no
  animation library on public routes beyond small CSS transitions, dynamic
  imports for the charts and admin bundle. Admin code lives in its own route
  group so none of it reaches the public bundle. Target: LCP < 2.0s, CLS < 0.05,
  INP < 200ms on a mid-range Android over 4G.
- **Content integrity** — no keyword stuffing, no fabricated statistics, awards or
  testimonials. Empty sections hide themselves rather than rendering placeholders.

---

## 8. Design system

Tailwind 4 CSS-first config (`@theme`), tokens in `globals.css`:
`--color-brand-500: #025298` plus a 9-step blue ramp, `--color-accent: #f9a71b`,
ink/surface neutrals. Radix primitives + shadcn/ui for dialogs, dropdowns, tabs,
toasts, selects and the sheet-based mobile nav; `cn()` from `clsx` +
`tailwind-merge`. lucide-react icons at consistent 1.5px stroke. Layout uses a
12-column container at `max-w-7xl` with generous vertical rhythm; sections
alternate between full-bleed dark bands and white space rather than a wall of
cards. All of it documented as Storybook-style primitives in
`components/ui`, not one-off copies.

---

## 9. Deployment — cPanel (shared hosting)

The original brief assumed an Ubuntu VPS with Nginx. The target is cPanel shared
hosting, so the reverse proxy, process manager, and container layer are replaced
by what cPanel actually provides. Full runbook in `docs/DEPLOYMENT.md`.

```
Browser
  ↓ HTTPS (cPanel AutoSSL, forced redirect)
Apache / LiteSpeed  ← runs .htaccess: security headers, gzip/brotli,
  │                    /admin-teftef X-Robots-Tag, static + /media cache
  ├─ Passenger "Setup Node.js App" #1  →  apps/web   (Next.js 16)
  └─ Passenger "Setup Node.js App" #2  →  apps/api   (Express 5)
                                              ↓
                                     MySQL 8 (phpMyAdmin-created DB + user)
```

| Brief assumed | cPanel reality | Decision |
| --- | --- | --- |
| Nginx reverse proxy | Apache/LiteSpeed + Passenger | `.htaccess` for headers, redirects, cache, and the `X-Robots-Tag` on admin |
| PM2 / `pm2 reload` | Passenger via **Setup Node.js App** UI | each app gets an entry with a startup file; "Run NPM script" for `next build` and `migrate` |
| Docker Compose | not available | none. Deployment is file upload + cPanel UI config |
| Redis for cache / rate limit / sessions | usually not provisioned | in-process LRU cache + in-memory token blocklist, both behind interfaces so Redis can be added later without touching call sites |
| Nginx static/media cache | `.htaccess` `mod_expires` + Passenger | media served by Express with long `Cache-Control`; `next/image` optimization stays in the web app |
| Uploads to `~/storage` | `public_html` is web-writable | media written outside the docroot by default (`MEDIA_ROOT`); if the host forces an in-root layout, `MEDIA_ROOT` points there instead |

cPanel specifics that shape the build:

- **Two Node apps, one per process.** `apps/web` starts `node_modules/.bin/next start`
  on its assigned port; `apps/api` starts `server.js` on its own. Both listen on
  `127.0.0.1`; Passenger maps them. `API_INTERNAL_URL` is used server-to-server so
  app-to-app calls never cross the public internet.
- **`output: 'standalone'` is not used.** Passenger owns the process lifecycle and
  expects `node_modules` to exist in the app root, which standalone output would
  strip. Standard `next build` output is used instead, with `.npmrc` to keep
  native modules installable.
- **Migrations run from the UI, not a shell.** cPanel's "Run NPM script" runs
  `npm run migrate` and `npm run seed:roles` with `.env` injected. A guide also
  documents the cPanel Terminal fallback and the phpMyAdmin SQL-import path for
  hosts with SSH disabled. No `sequelize.sync()` anywhere as a safety net.
- **No dev server in production.** `NODE_ENV=production` in the app environment
  block; Next's dev overlay and Express's stack traces are both off.
- **Scheduler via cron.** Daily MySQL dump through cPanel cron calling
  `npm run backup`; activity-log pruning and token-blocklist cleanup on the same
  cron. No long-lived in-process schedulers, since Passenger restarts apps
  unpredictably on shared plans.
- **Env management** uses the cPanel "Environment Variables" UI plus a `.env` in
  the app root; `config/env.js` validates with zod at boot so a missing variable
  fails fast with its name rather than surfacing as a runtime 500.
- **Resource discipline.** Passenger enforces per-app memory limits and kills
  over-limit processes, so connection pooling is capped (Sequelize pool max 5),
  image processing is queued through `sharp`'s concurrency limiter, and Recharts
  only mounts inside dynamic imports on the dashboard.

**Local prerequisite:** MySQL is not installed on this machine and there is no
MySQL service running. Docker is present, but since production is cPanel I will
install MySQL 8 locally rather than containerise, so the dev and production
databases match. If you would rather I use Docker locally for speed, say so.

---

## 10. Open questions

1. Logo asset: can you provide a vector or ≥1200px PNG? Current file is 96×58.
2. Do you want Docker for MySQL locally, or a native install?
3. Real content (company story, address, phone, service list, team) — do you have
   it now, or do I build the structures with clearly-marked empty states?
4. Is `/clients` meant to show logos of real clients, or only client-type case
   studies? Affects whether that page exists at all early on.
5. Newsletter/CRM integration, or is the contact inbox enough for now?
6. Payment gateway integration (Chapa, Telebirr, Stripe) — in scope, or invoicing
   tracked manually for now?

## 11. Phase plan on approval

1. Scaffold monorepo, configs, env, Tailwind theme, base UI kit.
2. Models, migrations, seeders (roles/permissions, no fake business data).
3. API: auth, RBAC, audit, public read endpoints, contact.
4. Admin: auth, dashboard, then CRUD module by module.
5. Public site, fully data-driven.
6. SEO pass: metadata, JSON-LD, sitemap, robots, Core Web Vitals.
7. Security hardening and full review.
8. Tests: API integration tests, RBAC matrix tests, key-page Lighthouse checks.
9. cPanel deployment guide (`.htaccess`, two Node.js App entries, env, cron,
   migrations, media permissions) plus an operations runbook.