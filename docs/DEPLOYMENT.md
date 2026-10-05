# Virallink — Deploying to cPanel

cPanel shared hosting, not a VPS. That changes the architecture: no Nginx, no
Docker, no PM2, no Redis. Apache or LiteSpeed fronts two "Setup Node.js App"
applications managed by Passenger, with MySQL from phpMyAdmin.

This guide assumes CloudLinux with the **Application Manager** (or **Setup Node.js
App**) plugin. Check in cPanel under **Software**. If that plugin is absent,
Node.js cannot run on the account and this deployment path does not apply.

---

## What gets deployed

Two independent applications:

| App | Directory | Startup | Port |
| --- | --- | --- | --- |
| Website | `apps/web` | `npm run start` → `next start` | 3000 |
| API | `apps/api` | `npm run start` → `node src/server.js` | 4000 |

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

Upload the repository **excluding** these:

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

**Application 2 — API**

| Field | Value |
| --- | --- |
| Node.js version | same as above |
| Application mode | Production |
| Application root | `virallink/apps/api` |
| Application URL | `api.yourdomain.com` |
| Application startup file | `src/server.js` |

The API startup file is `src/server.js`, not `server.js`.

A subdirectory URL such as `yourdomain.com/site` works, but the public site is
much simpler at the domain root because every canonical URL and sitemap entry is
built from `NEXT_PUBLIC_SITE_URL`.

---

## 4. Install dependencies

Upload the code **including** `node_modules`, or run `npm install` once at the
repository root from **Run NPM Script** or the cPanel Terminal:

```bash
cd ~/virallink && npm install
```

Install **once at the repository root**. npm workspaces then links `apps/api` and
`apps/web` against the hoisted `node_modules`. Running it separately per app
duplicates ~300MB and can break workspace resolution.

Note what is *not* needed: no migrate step, no seed step, no admin-creation
command. The API does all three on startup — see steps 6 and 7.

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

DB_HOST=localhost
DB_PORT=3306
DB_NAME=cpaneluser_virallink_prod
DB_USER=cpaneluser_virallink_user
DB_PASSWORD=<generated>

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

# First-run bootstrap. Both default to true, so you do not need to set them.
# See step 6.
AUTO_MIGRATE=true
AUTO_SEED=true
```

`NEXT_PUBLIC_*` values are compiled into the client bundle at build time, so
changing them requires a rebuild — not just a restart.

### Option B — a .env file

Place `.env` at `/home/cpaneluser/virallink/.env`. `config/env.js` walks upward
from the API directory and finds it. Never upload this file from a public
directory.

---

## 6. Schema and reference data: automatic

**There is nothing to run here.** The API applies pending migrations and seeds the
RBAC baseline every time it starts, before it opens its listening port.

This is deliberate and is a consequence of the hosting target, not a shortcut. On
cPanel the only thing that can be started is the Node.js application itself, so
there may be no shell, no cron and no "Run NPM Script" button to apply a schema
change from. Making a deploy depend on a manual step means the next one silently
serves requests against a schema that is one migration behind.

Both operations are idempotent, which is what makes running them on every boot
safe:

- a migration runs **once**, then its filename is recorded in the `SequelizeMeta`
  table, so it never runs twice;
- the seeder **upserts**, so re-running updates rows rather than duplicating them.
  It contains no business data — no clients, employees, testimonials or statistics.

On the first boot against an empty database this creates all 41 tables, runs the
11 migrations and seeds 44 permissions, 4 roles, 12 financial categories and the
company profile. Every later boot finds nothing pending and takes a few
milliseconds.

**On concurrent processes:** Passenger starts several processes for one
application and they all execute this at once on a deploy. Two of them running the
same migration simultaneously is how a schema gets corrupted, so the migration
step is serialised with a MySQL advisory lock. The second process waits for the
lock, then finds nothing pending.

Set `AUTO_MIGRATE=false` or `AUTO_SEED=false` only on a host where you *can* run
`npm run migrate` deliberately. On this host, off means the schema is never
updated.

**If a migration fails**, the API logs the error and does not start. That is
intended: an app that refuses to boot is a visible failure, whereas one that starts
against a half-built schema 500s on every page with nothing in the log to explain
it. The migration helpers tolerate an already-present column, so a migration that
failed partway is recoverable simply by fixing it and restarting.

You can still run these by hand on a machine that has a shell — `npm run migrate`
and `npm run seed` reach exactly the same end state. They are a developer
convenience, not a deployment step.

---

## 7. Create the first administrator

**Done in the browser, not the terminal.**

Open `https://yourdomain.com/vira-admin/login`. On an install with no accounts the
page shows **first-time setup** instead of the sign-in form: enter a name, email
and password, and the account is created with the SUPER_ADMIN role.

That form exists for the same reason as the automatic migrations. The schema can
build itself, but a person cannot, and without this a fresh install would have no
way to sign in and no way to create the first account. The hosting target gives no
shell to run `npm run create:admin` in.

Two things make it safe:

- **The API refuses the request the moment any account exists** — permanently, not
  just while the form is hidden. Two simultaneous requests on an empty install
  cannot both pass the "no users" check, because the count is re-verified inside
  the insert.
- It returns nothing but a boolean about whether setup is needed, so it cannot be
  used to discover whether an email address has an account.

The password rules are the same as the admin user form: at least 12 characters
with an upper case letter, a lower case letter and a number.

To add further accounts afterwards, use **System → Users & roles** in the admin,
or `npm run create:admin` from a shell if you have one.

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
RewriteCond %{REQUEST_URI} ^/vira-admin
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
curl -I https://yourdomain.com/vira-admin/dashboard
```

The second must return `307` redirecting to the login page — proof the auth gate
works.

Check that the bootstrap actually ran. The API log on startup contains:

```
AUTO_MIGRATE is on — applying pending migrations
AUTO_SEED is on — seeding reference data
```

and nothing after that on a database that was already current. If you see
`migration applied` lines, this deploy brought the schema up to date — which is
the expected result of the first deploy and of any deploy carrying a new migration.

Then open `https://yourdomain.com/vira-admin/login` in a browser. On a fresh
install it offers **first-time setup**; create the administrator, and the form
disappears. On an install that already has accounts it shows the normal sign-in
form and the setup option is gone.

Confirm the index protections:

```bash
curl -I https://yourdomain.com/robots.txt | grep -i "x-robots\|content-type"
curl https://yourdomain.com/robots.txt | grep admin
curl -I https://yourdomain.com/vira-admin/dashboard | grep -i "x-robots"
```

Then check by hand:

- [ ] Sign in at `/vira-admin/login`
- [ ] Publish a service — `/services/<slug>` appears without a redeploy
- [ ] The new URL is in `/sitemap.xml`
- [ ] An unpublished service returns 404 on its page
- [ ] `/vira-admin/*` does not appear in the sitemap
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
- [ ] `COOKIE_SECURE=true`
- [ ] `AUTO_MIGRATE=true` and `AUTO_SEED=true` — or simply unset, since both default to true. Do **not** set `AUTO_MIGRATE=false` on this host: there is no shell to run `npm run migrate` from, so the schema would never be updated.
- [ ] `JWT_SECRET` and `JWT_REFRESH_SECRET` are different 48-byte random values
- [ ] `CORS_ORIGINS` lists only your real origin, no `*`
- [ ] `SITE_URL` and `NEXT_PUBLIC_SITE_URL` both use `https://`
- [ ] `.env` is not inside `public_html`
- [ ] AutoSSL enabled, HTTP redirects to HTTPS
- [ ] Database user is not `root`
- [ ] Daily backups configured and a restore actually tested
- [ ] Only `SUPER_ADMIN` accounts can reach user and role management
- [ ] First administrator created, and `/vira-admin/login` no longer offers first-time setup
- [ ] `X-Robots-Tag` present on `/vira-admin/*` responses
- [ ] `https://yourdomain.com/robots.txt` disallows `/vira-admin`

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