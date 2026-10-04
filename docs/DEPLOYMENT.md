# Virallink — Deploying to cPanel

cPanel shared hosting, not a VPS. That changes the architecture: no Nginx, no
Docker, no PM2, no Redis. Apache or LiteSpeed fronts two "Setup Node.js App"
applications managed by Passenger, with MySQL from phpMyAdmin.

This guide assumes CloudLinux with the **Application Manager** (or **Setup Node.js
App**) plugin. Check in cPanel under **Software**. If that plugin is absent,
Node.js cannot run on the account and this deployment path does not apply.

---

## Before you deploy: three open bugs

The deployment itself works — the app builds, the API boots, and the steps below
are accurate. But three defects are still outstanding, and **two of them will
make a step 11 check fail**, so read this first.

1. **The admin console cannot save anything.** Every create, edit, delete and
   publish in `/admin-teftef` posts to `/api/<resource>` on the *website*, but
   `apps/web/app/api/` only contains `auth/login`, `auth/logout`, `auth/refresh`
   and `contact`. There is no catch-all proxy and no `rewrites()` in
   `next.config.mjs`, so those requests 404. Step 11's "publish a service" and
   "submit the contact form" checks will fail. Fix: add a forwarding route at
   `apps/web/app/api/[...path]/route.js`.

2. **Uploaded media returns 401.** `apps/api/src/routes/index.js` mounts
   `adminRoutes` at line 46 and the public media handler at line 57, and `media`
   is in that router's `ADMIN_PREFIXES` set — so an anonymous `GET /media/...`
   hits the auth guard and is rejected. Compounding it, `MEDIA_PUBLIC_URL=/media`
   is root-relative, so stored URLs resolve against the website, which serves
   nothing there. Step 11's "upload an image" check will fail. Fix: move the
   media route above the admin router, and give it a route on the web app or an
   absolute `MEDIA_PUBLIC_URL`.

3. **`npm run backup` is broken.** `src/scripts/backup.js` uses `require()` in an
   ESM module. See the note in step 12.

Two more worth knowing about, which will not fail a deployment but will be
noticed:

- `/admin-teftef` itself returns 404 — there is no `(protected)/page.js`. The
  Dashboard link in the nav points there, so use `/admin-teftef/dashboard`
  directly. Step 11 already tests the full path.
- There is no social card image: `app/og-image/route.js` exports no `GET`, so it
  returns 405, and `lib/seo.js` points at `/og-default.png`, which does not
  exist. Links shared to social media will render without a preview.

---

## What gets deployed

Two independent applications:

| App | Directory | Startup file | Port |
| --- | --- | --- | --- |
| Website | `apps/web` | `server.js` (or `npm run start`) | 3000 |
| API | `apps/api` | `src/server.js` (or `npm run start`) | 4000 |

Both read `PORT` from the environment, because Passenger assigns the port rather
than letting the app pick it. See step 3.

The browser never talks to the API directly. Admin requests go to the website,
which forwards them over loopback. That means **the API port never needs to be
exposed or firewalled** — leave it bound to `127.0.0.1`.

---

## 1. Create the database

**cPanel → MySQL® Databases**

1. Create a database, e.g. `virallink_prod` → becomes `cpaneluser_virallink_prod`
2. Create a user with a strong generated password
3. Add the user to the database with **ALL PRIVILEGES**

Note the full prefixed names — that is what goes in `.env`.

Then **phpMyAdmin → your database → Import** is not needed. Run the migrations
instead (step 5), which is safer than importing SQL by hand.

---

## 2. Upload the code

Two workable orders. Pick one and stay consistent — the mistake that causes
stale pages is uploading the code but not the matching `.next`.

### Option A — build on the server (recommended first time)

Upload without `.next`, then build on the server:

```bash
tar --exclude=node_modules --exclude=.next --exclude=.env --exclude=.git \
    --exclude=storage -czf virallink.tar.gz apps packages package.json .env.example
```

Upload to `/home/cpaneluser/`, **Extract** in File Manager, then in cPanel run
**Run NPM Script → `npm run build:web`**. Compilation happens on the host, so
there is never a mismatch between a build and the Node version it was made with.

### Option B — build locally

```bash
npm install
npm run build:web
```

Then include `.next` in the archive — **including** `apps/web/.next` this time.
Cheaper on the host's CPU, which matters on shared plans, but you must upload a
fresh `.next` with every code change.

Either way you end up with:

```
/home/cpaneluser/virallink/
├─ apps/
│  ├─ api/
│  └─ web/
├─ packages/shared/
├─ storage/media/        created in step 8
└─ package.json
```
node_modules
.next
.git
.env
storage/media/*
```

Use cPanel File Manager, or from a local terminal:

```bash
# Build locally first, so the server never compiles
npm install
npm run build

# Create the archive
tar --exclude=node_modules --exclude=.next --exclude=.env --exclude=.git \
    --exclude=storage -czf virallink.tar.gz apps packages package.json .env.example
```

Upload the archive to `/home/CPANELUSER/`, then **Extract** it in File Manager.

```
/home/cpaneluser/virallink/
├─ apps/
│  ├─ api/
│  └─ web/
├─ packages/shared/
└─ package.json
```

---

## 3. Create the two Node.js apps

**cPanel → Setup Node.js App → Create Application** (twice).

**Application 1 — website**

| Field | Value |
| --- | --- |
| Node.js version | 20.x or 22.x |
| Application mode | Production |
| Application root | `virallink/apps/web` |
| Application URL | `yourdomain.com` |
| Application startup file | `server.js` |

`apps/web/server.js` exists for exactly this reason: cPanel's **Application
startup file** field wants a file path, not a command, so `next start` cannot be
expressed in it. The wrapper boots the production Next server and binds to
loopback on whatever `PORT` Passenger assigns. If your host's plugin offers a
**Startup command** field instead, use `npm run start` there and leave the
startup file blank.

**Application 2 — API**

| Field | Value |
| --- | --- |
| Node.js version | same as above |
| Application mode | Production |
| Application root | `virallink/apps/api` |
| Application URL | `api.yourdomain.com` |
| Application startup file | `src/server.js` |

The API startup file is `src/server.js`, not `server.js`. It reads `PORT` and
`API_HOST` from the environment, so match `PORT` to whatever Passenger assigned.

A subdirectory URL such as `yourdomain.com/site` works, but the public site is
much simpler at the domain root because every canonical URL and sitemap entry is
built from `NEXT_PUBLIC_SITE_URL`.

---

## 4. Install dependencies

Inside each app's entry, click **Run NPM Script**:

```
npm install
```

Or use the **Terminal** in cPanel:

```bash
cd ~/virallink && npm install
```

Install **once at the repository root**. npm workspaces then links
`apps/api` and `apps/web` against the hoisted `node_modules`. Running it
separately per app duplicates ~300MB and can break workspace resolution.

---

## 5. Environment variables

Two options. Use the cPanel UI if you have it; otherwise a `.env` file.

### Option A — the UI

**Setup Node.js App → your app → Environment Variables**. Add the same variables
to both apps, adjusting `SITE_URL` and `CORS_ORIGINS`:

```env
NODE_ENV=production

# API only
PORT=4000
API_HOST=127.0.0.1

# Shared
SITE_URL=https://yourdomain.com
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
NEXT_PUBLIC_API_PUBLIC_URL=
API_INTERNAL_URL=http://127.0.0.1:4000
NEXT_PUBLIC_ADMIN_PATH=/admin-teftef

DB_HOST=localhost
DB_PORT=3306
DB_DIALECT=mysql
DB_NAME=cpaneluser_virallink_prod
DB_USER=cpaneluser_virallink_user
DB_PASSWORD=<generated>
DB_POOL_MAX=5

JWT_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<openssl rand -base64 48, different>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d
COOKIE_SECURE=true
BCRYPT_ROUNDS=12

CORS_ORIGINS=https://yourdomain.com

STORAGE_DRIVER=local
MEDIA_ROOT=/home/cpaneluser/virallink/storage/media
MEDIA_PUBLIC_URL=/media
MEDIA_MAX_BYTES=10485760

LOG_LEVEL=info

# Required in production — see the note below. Omitting these makes the API
# refuse to boot with "Unsafe production configuration".
DB_SYNC_ALLOWED=false
AUTO_MIGRATE=false
AUTO_SEED=true
```

### AUTO_MIGRATE must be false in production

The API applies pending migrations and seeds the RBAC baseline at boot, which is
what makes a local `npm run dev` work against an empty database with no manual
step. That behaviour is **disabled in production**, and `config/env.js` exits at
startup if `AUTO_MIGRATE` is true there:

```
Unsafe production configuration:
  - AUTO_MIGRATE must be false in production. Passenger can start several
    processes at once and concurrent migrations on a live database are not safe.
```

Passenger can start several processes at once, and two of them running the same
migration at once is how you corrupt a schema. So in production you apply
migrations deliberately, one process at a time, in step 6.

`AUTO_SEED` stays `true`. The seeder is pure upsert — permissions, four roles,
their grants, twelve financial categories and the company profile — so running it
on every boot cannot duplicate a row or lose data. It is the same code
`npm run seed` runs.

The rest of the block is optional: `DB_DIALECT`, `DB_POOL_*`, `COOKIE_DOMAIN`,
`COOKIE_PATH`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES`, `RATE_LIMIT_*`,
`MEDIA_ALLOWED_TYPES`, `ACTIVITY_RETENTION_DAYS`, `BACKUP_*` and `STORAGE_REGION`
all have defaults in `config/env.js`. They are listed above so you know they
exist. `NEXT_PUBLIC_*` values are compiled into the client bundle at build time,
so changing them requires a rebuild — not just a restart.

### Option B — a .env file

Place `.env` at `/home/cpaneluser/virallink/.env`. `config/env.js` walks upward
from the API directory and finds it. Never upload this file from a public
directory.

---

## 6. Run migrations

**Setup Node.js App → API app → Run NPM Script**:

```
npm run migrate
```

Then seed the roles and permissions:

```
npm run seed
```

Both are safe to re-run: applied migrations are recorded in the `SequelizeMeta`
table and the seeder uses upserts. `npm run seed` contains no fake business data.
Confirm what has run:

```bash
npm run migrate:status
```

If **Run NPM Script** is unavailable, use **Terminal**:

```bash
cd ~/virallink/apps/api && npm run migrate && npm run seed
```

Both steps are also what the API would do on its own if `AUTO_MIGRATE=true`, but
step 5 sets it to `false`, so run them here. Re-run this section after every
deploy that ships a new migration.

---

## 7. Create the administrator

```bash
cd ~/virallink/apps/api && npm run create:admin
```

Interactive, so the password never appears in shell history. Do this over SSH,
not the web terminal, if your host logs terminal sessions.

---

## 8. Media directory permissions

```bash
mkdir -p ~/virallink/storage/media
chmod 755 ~/virallink/storage/media
```

If the API cannot write, the uploads fail silently in the UI while logging a
permission error. Verify with **Terminal**:

```bash
cd ~/virallink/apps/api
node -e "import('./src/config/env.js').then(async m=>{const d=(await import('./src/config/storage.js')).default;await d.put('test/perm.txt',Buffer.from('ok'),'text/plain');await d.delete('test/perm.txt');console.log('storage OK')})"
```

Keep `MEDIA_ROOT` **outside** `public_html`. Files are served through the API's
media route, which validates the key and resolves it inside the media root, so a
traversal attempt cannot escape. Uploads are re-encoded to WebP by `sharp`,
which strips EXIF including GPS coordinates.

---

## 9. Add the .htaccess rules

Create `/home/cpaneluser/public_html/.htaccess`. Passenger must see the Node
apps before any generic rewrite, so Passenger's rewrite goes first.

```apache
# ---------------------------------------------------------------
# Virallink — cPanel / Apache configuration
# ---------------------------------------------------------------

# Preserve Passenger's rewrite so Node apps are reached.
RewriteEngine On
RewriteRule ^$ index.php [L]
RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]
RewriteRule .* - [E=NO_CACHE:1]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.php [L]

# ---------------------------------------------------------------
# Force HTTPS
# ---------------------------------------------------------------
RewriteCond %{HTTPS} !=on
RewriteCond %{HTTP:X-Forwarded-Proto} !https
RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]

# ---------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  Header always set Strict-Transport-Security "max-age=63072000; includeSubDomains"

  # The admin area must never be indexed. Third layer of protection, alongside
  # the robots.txt rule and the noindex metadata in the admin layout.
  Header always set X-Robots-Tag "noindex, nofollow, noarchive" env=REDIRECT_ADMIN

  # Uploaded media is user content. Forbid execution and inline rendering.
  <FilesMatch "\.(php|phtml|php\d|pl|py|cgi|sh)$">
    Header always set X-Content-Type-Options "nosniff"
  </FilesMatch>
</IfModule>

# Block execution inside the storage directory, in case it is ever moved
# into the document root.
<DirectoryMatch "/storage/">
  <IfModule mod_headers.c>
    Header set X-Content-Type-Options "nosniff"
    Header set Content-Disposition "attachment"
  </IfModule>
  php_flag engine off
  AllowOverride None
  Require all denied
</DirectoryMatch>

# ---------------------------------------------------------------
# Compression
# ---------------------------------------------------------------
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/plain text/xml text/css
  AddOutputFilterByType DEFLATE application/javascript application/json
  AddOutputFilterByType DEFLATE application/xml image/svg+xml
</IfModule>

# ---------------------------------------------------------------
# Browser caching
# ---------------------------------------------------------------
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 1 year"
  ExpiresByType application/javascript "access plus 1 year"
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/avif "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"

  # HTML must revalidate, or a deploy would never reach visitors.
  ExpiresByType text/html "access plus 0 seconds"
</IfModule>

# ---------------------------------------------------------------
# Block access to sensitive files
# ---------------------------------------------------------------
<FilesMatch "^\.env|\.env\.(?!example)|composer\.(json|lock)|package-lock\.json$">
  Require all denied
</FilesMatch>

Options -Indexes
```

To apply the admin `X-Robots-Tag` rule, add this before the header block:

```apache
RewriteEngine On
RewriteCond %{REQUEST_URI} ^/admin-teftef
RewriteRule ^(.*)$ $1 [E=REDIRECT_ADMIN:1]
```

---

## 10. Enable SSL

**cPanel → SSL/TLS Status** → **Run AutoSSL** for the domain and any subdomain.

Confirm the redirect works:

```bash
curl -I https://yourdomain.com/
```

Expect `301` to the same URL over HTTPS. `COOKIE_SECURE=true` means sessions will
not work over plain HTTP, so this step is not optional.

---

## 11. Verify

```bash
# API health
curl https://api.yourdomain.com/health
# → {"status":"ok","database":"up",...}

# Public site
curl -I https://yourdomain.com/
curl -I https://yourdomain.com/admin-teftef/dashboard
```

The second must return `307` redirecting to the login page — proof the auth gate
works.

Confirm the index protections:

```bash
curl -I https://yourdomain.com/robots.txt | grep -i "x-robots\|content-type"
curl https://yourdomain.com/robots.txt | grep admin
curl -I https://yourdomain.com/admin-teftef/dashboard | grep -i "x-robots"
```

Then check by hand:

- [ ] Sign in at `/admin-teftef/login`
- [ ] Publish a service — `/services/<slug>` appears without a redeploy
- [ ] The new URL is in `/sitemap.xml`
- [ ] An unpublished service returns 404 on its page
- [ ] `/admin-teftef/*` does not appear in the sitemap
- [ ] Upload an image — it appears with the right dimensions
- [ ] Submit the contact form — the enquiry shows in the admin inbox

---

## 12. Cron jobs

**cPanel → Cron Jobs**. Run the maintenance job nightly and the backup daily.

```bash
# 03:15 — prune expired sessions and old audit rows
15 3 * * * cd /home/cpaneluser/virallink/apps/api && /home/cpaneluser/nodevenv/virallink/apps/api/20/bin/node src/scripts/pruneActivity.js >> /home/cpaneluser/virallink/storage/cron.log 2>&1

# 04:30 — database backup
30 4 * * * cd /home/cpaneluser/virallink/apps/api && /home/cpaneluser/nodevenv/virallink/apps/api/20/bin/node src/scripts/backup.js >> /home/cpaneluser/virallink/storage/cron.log 2>&1
```

Use the **absolute path to the node binary cPanel gave you** — `which node` from
the terminal. A relative `node` will not resolve in cron.

### Check the backup is actually producing files

Do not assume it is working. After the first cron cycle:

```bash
ls -lt ~/virallink/storage/backups/
tail -20 ~/virallink/storage/cron.log
```

An empty `backups/` directory after a cycle means the job is failing, and the
usual cause is that the host has no `mysqldump` binary on the PATH for the cron
environment. In that case use **phpMyAdmin → Export → Save as file** on a daily
schedule instead, and confirm you can restore a copy before relying on it.

> **Known issue.** `src/scripts/backup.js` currently calls `require()` inside a
> file that uses ESM `import` (`apps/api/package.json` sets `"type": "module"`),
> so it throws `ReferenceError: require is not defined` and the cron entry above
> fails on every run. Fix this before treating backups as working.

---

## Redeploying

Upload changed files, then in each app: **Run NPM Script → `npm install`**, then
**Restart**.

If `next.config.mjs`, `.env` `NEXT_PUBLIC_*` values, or dependencies changed,
run `npm run build` locally and upload `.next` too. A rebuild is mandatory for
any `NEXT_PUBLIC_*` change, because those values are inlined at build time.

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| 500 on every page | App logs show the real error. `Setup Node.js App → your app → Open Logs`. Most often a missing env var or a failed migration. |
| `EADDRINUSE` | Passenger assigned a different port than `PORT`. Read `PORT` from the cPanel panel and match it. |
| Admin login succeeds then bounces | `COOKIE_SECURE=true` with HTTP. Enable AutoSSL. Also check `NEXT_PUBLIC_SITE_URL` matches the real origin exactly, including scheme. |
| Media uploads fail | `MEDIA_ROOT` not writable. Run the permission check from step 8. |
| Stale content after an edit | The API caches public reads for 2–10 minutes. Any admin write clears it, so a stale page means the write itself failed. |
| `429` from the contact form | 5 submissions/hour per IP by default. Raise `RATE_LIMIT_CONTACT_MAX`. |
| API returns 502 | Either the app is stopped or `API_INTERNAL_URL` is wrong. `curl http://127.0.0.1:4000/health` from Terminal. |
| `Module not found` after a Git pull | Run `npm install` again at the repository root. |
| Out of memory / process killed | Lower `DB_POOL_MAX` to 2 and `BCRYPT_ROUNDS` is not the cause — image processing is. Raise the host's memory limit or set `images.unoptimized = true` (already the default). |

---

## Security checklist

- [ ] `NODE_ENV=production`
- [ ] `DB_SYNC_ALLOWED=false` — **critical**. True in production can drop columns and destroy financial data. The API refuses to boot if it is true, but verify it is not set.
- [ ] `AUTO_MIGRATE=false` — **critical**. The API refuses to boot in production if it is true, because Passenger can start concurrent processes and concurrent migrations on a live database are not safe.
- [ ] `COOKIE_SECURE=true`
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are different 48-byte random values
- [ ] `CORS_ORIGINS` lists only your real origin, no `*`
- [ ] `SITE_URL` and `NEXT_PUBLIC_SITE_URL` both use `https://`
- [ ] `.env` is not inside `public_html`
- [ ] AutoSSL enabled, HTTP redirects to HTTPS
- [ ] Database user is not `root`
- [ ] Daily backups configured and a restore actually tested
- [ ] Only `SUPER_ADMIN` accounts can reach user and role management
- [ ] `X-Robots-Tag` present on `/admin-teftef/*` responses
- [ ] `https://yourdomain.com/robots.txt` disallows `/admin-teftef`

## Operational notes

### A note on the local `.env`

The repository's `.env` contains **development-only** secrets generated on the
build machine. `.gitignore` excludes `.env`, and production secrets are generated
on the server. Never copy the local file to production and never commit it. The
API refuses to boot in production if the two JWT secrets are identical or if
either is under 32 characters.

**No Redis.** Caching is in-process LRU with a TTL, rate limiting uses the
in-memory store, and sessions are stateless JWTs with a database-backed refresh
table. Fine for one Node process. If you ever scale horizontally, the two adapter
modules in `src/utils/cache.js` are the only thing that changes.

**Passenger restarts.** Shared hosts recycle processes unpredictably, so there
are no long-running in-process schedulers — maintenance runs from cron. Expect
brief 502s during a restart.

**Connection pool.** `DB_POOL_MAX=5` is deliberately small. Hosts cap concurrent
MySQL connections per user and enforce a per-process memory ceiling.

**`output: 'standalone'` is not used.** Passenger expects a real `node_modules`
directory; standalone output would strip it. Standard `next build` output is used
throughout.