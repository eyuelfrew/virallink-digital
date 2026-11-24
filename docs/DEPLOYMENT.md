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
| Website | `apps/web` | `server.js` | 3000 |
| API | `apps/api` | `src/server.js` | 4000 |

The browser calls the API directly at `https://api.virallinkdigital.com/api/v1/...`
for every admin and form action. The website only renders pages and performs
server-side data reads. Passenger exposes the API through its subdomain while the
Node process itself stays bound to `127.0.0.1:4000` — leave `API_HOST=127.0.0.1`.
The API must allow `https://virallinkdigital.com` in `CORS_ORIGINS` and set the
session cookie for `COOKIE_DOMAIN=virallinkdigital.com`, or sign-in will fail from
the site.

---

## 1. Create the database

**cPanel → MySQL® Databases**

1. Create a database, e.g. `virallink_prod` → becomes `cpaneluser_virallink_prod`
2. Create a user with a strong generated password
3. Add the user to the database with **ALL PRIVILEGES**

Note the full prefixed names — that is what goes in `.env`.

Then **phpMyAdmin -> your database -> Import** is not needed. The API applies the migrations
on first boot (step 6), which is safer than importing SQL by hand.

---

## 2. Upload the code

Upload the repository **excluding** these:

```
node_modules
.git
.env
storage/media/*
```

Use cPanel File Manager, or from a local terminal:

```bash
# Build locally first, so the server never compiles. Use production public
# values here: NEXT_PUBLIC_* are inlined at build time.
# Bash / Git Bash:
cd apps/web && NEXT_PUBLIC_SITE_URL=https://virallinkdigital.com NEXT_PUBLIC_API_PUBLIC_URL=https://api.virallinkdigital.com npm run build && cd ../api && npm run build && cd ..

# PowerShell:
$env:NEXT_PUBLIC_SITE_URL="https://virallinkdigital.com"; $env:NEXT_PUBLIC_API_PUBLIC_URL="https://api.virallinkdigital.com"; npm run build:web; npm run build:api

# Confirm the real origin was baked in, not localhost:
#   grep "Sitemap:" apps/web/.next/server/app/robots.txt.body

# Create the archive
tar --exclude=node_modules --exclude=.env --exclude=.git \
    --exclude=storage --exclude=apps/web/.next/dev -czf virallink.tar.gz apps packages package.json package-lock.json .env.example
```

`.next/dev` is development-server output (roughly 748 MB of LevelDB files in this build) and is not needed by the production Node.js app. Exclude it to keep the upload smaller. A stray `.next.zip` left next to `.next` is also deleted/excluded - it is not part of the build. `.next/cache` can be excluded too if you want a smaller upload; `next start` rebuilds what it needs.

**Never extract a build over an existing `.next` directory, and never upload an old `.next.zip`.** Next's HTML and its hashed chunk filenames are one atomic build unit. Mixing two builds leaves HTML referencing chunks that were never uploaded; the browser then gets a `text/plain` 404 for the missing `.js` and shows the route error screen with `ChunkLoadError`. Always stop the app, delete `apps/web/.next` entirely, then extract the fresh build. Every hashed file under `.next/static/chunks` must be present — do not filter that directory by name.

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
| Application URL | `virallinkdigital.com` |
| Application startup file | `server.js` (or `index.js`, an included alias) |

**Application 2 — API**

| Field | Value |
| --- | --- |
| Node.js version | same as above |
| Application mode | Production |
| Application root | `virallink/apps/api` |
| Application URL | `api.virallinkdigital.com` |
| Application startup file | `src/server.js` (or `index.js`, an included alias) |

The API startup file is `src/server.js`, not `server.js`.

A subdirectory URL such as `virallinkdigital.com/site` works, but the public site is
much simpler at the domain root because every canonical URL and sitemap entry is
built from `NEXT_PUBLIC_SITE_URL`.

---

## 4. Install dependencies

**Never upload `node_modules` from a Windows or macOS machine.** `bcrypt` and
`sharp` contain native binaries compiled for the machine that installed them; a
Windows build fails on the Linux server with a module-load error, and the API
will not start. Install on the server so npm downloads the Linux binaries.

Run once at the repository root from **Terminal**:

```bash
cd ~/virallink && npm ci --omit=dev
```

If the host only offers a per-application **Run NPM Install** action, run it for
`apps/api` and then `apps/web`. That creates app-local dependency trees and uses
more disk, but it is the only option without Terminal.

Install **once at the repository root** when possible. npm workspaces then links `apps/api` and
`apps/web` against the hoisted `node_modules`. Running it separately per app
duplicates ~300MB and can break workspace resolution.

If the host has no Terminal and no npm install action, upload a `node_modules`
tree that was installed **on Linux with the same Node major version** as the
cPanel app. A local development tree is not usable.

The archive from step 2 already contains `apps/web/.next`, so the server never
compiles. Note what is *not* needed: no migrate step, no seed step, no
admin-creation command. The API does all three on startup - see steps 6 and 7.

---

## 5. Environment variables

Two options. Use the cPanel UI if you have it; otherwise a `.env` file.

### Option A — the UI

**Setup Node.js App -> each app -> Environment Variables**. Add only the
variables each app needs.

**Website app** (`apps/web`):

```env
NODE_ENV=production
NEXT_PUBLIC_SITE_URL=https://virallinkdigital.com
# Browser calls go straight to this origin. NEXT_PUBLIC_* is inlined at build
# time, so this must also be set when you run npm run build (see step 2).
NEXT_PUBLIC_API_PUBLIC_URL=https://api.virallinkdigital.com
# Server-side rendering uses this base. Use the public origin if the two Node
# apps are not on the same machine; use http://127.0.0.1:4000 if they are.
API_INTERNAL_URL=https://api.virallinkdigital.com
NEXT_PUBLIC_ADMIN_PATH=/vira-admin
```

**API app** (`apps/api`):

```env
NODE_ENV=production
PORT=4000
API_HOST=127.0.0.1

SITE_URL=https://virallinkdigital.com
CORS_ORIGINS=https://virallinkdigital.com

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
# Session cookies must be readable by the website on the parent domain when the
# browser calls the API directly from another subdomain.
COOKIE_DOMAIN=virallinkdigital.com
BCRYPT_ROUNDS=12

STORAGE_DRIVER=local
MEDIA_ROOT=/home/cpaneluser/virallink/storage/media
MEDIA_PUBLIC_URL=/media
MEDIA_MAX_BYTES=10485760

LOG_LEVEL=info

# Production applies schema changes deliberately (Run NPM Script -> npm run
# migrate), so AUTO_MIGRATE must be false here. The API refuses to boot in
# production if it is true. AUTO_SEED stays true: the seeder is pure upsert.
AUTO_MIGRATE=false
AUTO_SEED=true

# Password recovery. All optional — the defaults are sensible.
# Codes are delivered over Telegram, so this only helps accounts that have
# Telegram linked.
PASSWORD_RESET_CODE_TTL_MINUTES=10
PASSWORD_RESET_MAX_ATTEMPTS=5
PASSWORD_RESET_MAX_SENDS_PER_HOUR=3
PASSWORD_RESET_RESEND_SECONDS=60
```

The website does not need the database or JWT secrets: all authentication and
data access happens at the API, which the browser calls directly. Keep those
values on the API app.

`NEXT_PUBLIC_*` values are compiled into the client bundle at build time, so
changing them requires a rebuild — not just a restart.

### Option B — a .env file per app

Each app has its own `.env`; neither reads the other.

- `apps/web/.env` — website only (Site URL + `API_INTERNAL_URL`). Never this
  file from a public directory.
- `apps/api/.env` — API only. Never this file from a public directory.

Both apps also honour a single root `.env` as a fallback for convenience, but
the split two-app setup is what is documented here.

---

## 6. Schema and reference data

In development the API applies pending migrations and seeds the RBAC baseline on
every start, before it opens its listening port (`AUTO_MIGRATE=true`,
`AUTO_SEED=true`). Both operations are idempotent:

- a migration runs **once**, then its filename is recorded in the `SequelizeMeta`
  table, so it never runs twice;
- the seeder **upserts**, so re-running updates rows rather than duplicating them.
  It contains no business data — no clients, employees, testimonials or statistics.

**In production, apply migrations deliberately.** Set `AUTO_MIGRATE=false` (the API
refuses to boot in production if it is true), then in cPanel open the API app and
use **Run NPM Script → `npm run migrate`** before restarting. One process applies
the changes; Passenger is not allowed to race several of them against a live
schema. `AUTO_SEED=true` stays on: the seeder is pure upsert, and it runs inside a
MySQL advisory lock so concurrent Passenger processes cannot duplicate the company
profile or financial categories.

On the first boot against an empty database, after the migrations have run, the
seeder creates the RBAC baseline — 49 permissions, 15 roles, 12 financial
categories and the company profile. Every later boot finds nothing pending and
takes a few milliseconds.

**If a migration fails**, the API logs the error and does not start. That is
intended: an app that refuses to boot is a visible failure, whereas one that starts
against a half-built schema 500s on every page with nothing in the log to explain
it. The migration helpers tolerate an already-present column, so a migration that
failed partway is recoverable by fixing it and running the migration again.

`npm run migrate` and `npm run seed` reach the same end state on a machine with a
shell. They are a developer convenience, and in production `npm run migrate` is the
deliberate schema step described above.

---

## 7. Create the first administrator

**Done in the browser, not the terminal.**

Open `https://virallinkdigital.com/vira-admin/login`. On an install with no accounts the
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
which strips EXIF including GPS coordinates. Stored rows use the site-relative
path `/media/<key>`; a Next.js redirect sends the browser to the API's
`/api/v1/media/<key>` instead of proxying the bytes through Next.js.

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
curl -I https://virallinkdigital.com/
```

Expect `301` to the same URL over HTTPS. `COOKIE_SECURE=true` means sessions will
not work over plain HTTP, so this step is not optional.

---

## 11. Verify

```bash
# API health
curl https://api.virallinkdigital.com/health
# → {"status":"ok","database":"up",...}

# Public site
curl -I https://virallinkdigital.com/
curl -I https://virallinkdigital.com/vira-admin/dashboard
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

Then open `https://virallinkdigital.com/vira-admin/login` in a browser. On a fresh
install it offers **first-time setup**; create the administrator, and the form
disappears. On an install that already has accounts it shows the normal sign-in
form and the setup option is gone.

Confirm the index protections:

```bash
curl -I https://virallinkdigital.com/robots.txt | grep -i "x-robots\|content-type"
curl https://virallinkdigital.com/robots.txt | grep admin
curl -I https://virallinkdigital.com/vira-admin/dashboard | grep -i "x-robots"
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
# 03:15 — prune expired sessions, spent reset codes and old audit rows
15 3 * * * cd /home/cpaneluser/virallink/apps/api && /home/cpaneluser/nodevenv/virallink/apps/api/20/bin/node src/scripts/pruneActivity.js >> /home/cpaneluser/virallink/storage/cron.log 2>&1

# 04:30 — database backup
30 4 * * * cd /home/cpaneluser/virallink/apps/api && /home/cpaneluser/nodevenv/virallink/apps/api/20/bin/node src/scripts/backup.js >> /home/cpaneluser/virallink/storage/cron.log 2>&1

# every 5 minutes — deliver queued Telegram notifications
*/5 * * * * cd /home/cpaneluser/virallink/apps/api && /home/cpaneluser/nodevenv/virallink/apps/api/20/bin/node src/scripts/telegramOutbox.js >> /home/cpaneluser/virallink/storage/cron.log 2>&1
```

Use the **absolute path to the node binary cPanel gave you** — `which node` from
the terminal. A relative `node` will not resolve in cron.

The Telegram drain line is only needed when `TELEGRAM_ENABLED=true`. Notifications
are delivered immediately when they are queued, so this is only a safety net for
anything a restarted process left behind — but on a host that recycles processes
unpredictably, it is the difference between "usually arrives" and "arrives".

Password reset codes go through the same queue, so this job is part of the
recovery path: a code queued while the process was being recycled is delivered
by the drain rather than lost. It is also why the code's lifetime
(`PASSWORD_RESET_CODE_TTL_MINUTES`, ten minutes by default) is worth leaving
generous — a code that arrives after it has expired is a code the person cannot
use.

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

---

## Telegram bot (optional)

Task notifications can be delivered through a Telegram bot. Nothing else requires
a bot, and the feature is inert until it is switched on.

1. Message **@BotFather**, run `/newbot`, and note the token it returns.
2. In `.env` set `TELEGRAM_ENABLED=true`, `TELEGRAM_BOT_TOKEN`, and
   `TELEGRAM_BOT_USERNAME` (the @name without the `@`). Generate a webhook secret
   and set `TELEGRAM_WEBHOOK_SECRET`:
   `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. Set `TELEGRAM_WEBHOOK_URL` to the API's public base URL — `https://api.virallinkdigital.com`
   — and restart the API. The API compares that value with the webhook
   Telegram actually has registered and **re-registers when they differ**, so
   this is normally the only step. `npm run telegram:webhook -- set` does the
   same thing by hand, and `npm run telegram:webhook --status` shows the
   registered URL and Telegram's last delivery failure.
4. Restart the API, then open **Account → Telegram notifications** and connect.

Telegram must be able to reach the API over HTTPS. The webhook URL path contains
the secret, and Telegram also sends it back in a header; the route requires both,
so discovering the URL is not enough to drive the bot.

**Three things that silently stop it, and what each looks like:**

| Problem | Symptom | Fix |
| --- | --- | --- |
| The subdomain has no certificate | `lastError` mentions an SSL error, or Telegram reports a 526 | Run AutoSSL for the subdomain, not just the apex domain. Telegram refuses an invalid certificate |
| Apache answers instead of the Node app | `lastError` is `404` | The subdomain's document root must point at the API app, and Passenger must own the path |
| The webhook still points at the old URL | `lastError` is `530` or a DNS failure | Set `TELEGRAM_WEBHOOK_URL` and restart, or run `npm run telegram:webhook -- set` |

All three are visible in `npm run telegram:webhook --status`, which prints
Telegram's own last delivery failure rather than leaving you to infer it.

### Testing it before the domain is live

The bot needs a public address to hear from Telegram, but a password-reset
code only needs the bot to *send*. On a machine with no public address, read
the chat id out of Telegram's own queue:

```bash
npm run telegram:chatid --workspace @virallink/api
```

It removes the webhook so Telegram queues updates, waits for you to message
the bot, and prints the chat id and username. Put the chat id in the
account's "Telegram chat id" field (Settings → Users → edit) and reset codes
are delivered from then on, with no domain involved.

Register the real webhook once the domain is live — the API does it by itself
when `TELEGRAM_WEBHOOK_URL` is set and the registered URL does not match.

### The webhook has to be reachable

This is the failure that hides best. A bot whose webhook points at a URL
Telegram cannot reach does not crash and does not log anything of its own — it
simply never hears anything. The visible consequences are that nobody can link
Telegram and nobody can recover a forgotten password, and the symptom reads as
"the feature is broken" rather than "the webhook is down".

Two things guard against it:

```bash
# check it — prints the registered URL and Telegram's last delivery failure
npm run telegram:webhook --status --workspace @virallink/api

# register it against the public base URL
npm run telegram:webhook -- set https://virallinkdigital.com --workspace @virallink/api
```

The API also checks the webhook on every boot and logs a warning when Telegram
cannot reach it, so the problem surfaces in the application log rather than
only in Telegram's own status.

**If the API is behind a tunnel** — a Cloudflare quick tunnel, `ngrok`, or
similar — the public URL changes every time the tunnel restarts, and the
webhook has to be re-registered each time. A quick tunnel's random
`trycloudflare.com` hostname is not a stable address to point a webhook at.
Use the production domain on cPanel; use a tunnel only for local testing, and
re-register the webhook after each restart of it.

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
| Browser says "No `Access-Control-Allow-Origin` header" and API requests return 500 | The API is rejecting the site's origin. Set `CORS_ORIGINS=https://virallinkdigital.com` in the **API app's** environment (exact string, no quotes, no trailing slash, no `www.`, no `*`) and restart the API app. Confirm with `curl -i -X OPTIONS https://api.virallinkdigital.com/api/v1/auth/login -H "Origin: https://virallinkdigital.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: content-type"` — a 204 with `Access-Control-Allow-Origin` means it is fixed. |
| `EADDRINUSE` | Passenger assigned a different port than `PORT`. Read `PORT` from the cPanel panel and match it. |
| Admin login succeeds then bounces | `COOKIE_SECURE=true` with HTTP. Enable AutoSSL. Also check `NEXT_PUBLIC_SITE_URL` matches the real origin exactly, including scheme. |
| Media uploads fail | `MEDIA_ROOT` not writable. Run the permission check from step 8. |
| Stale content after an edit | The API caches public reads for 2–10 minutes. Any admin write clears it, so a stale page means the write itself failed. |
| `429` from the contact form | 5 submissions/hour per IP by default. Raise `RATE_LIMIT_CONTACT_MAX`. |
| No reset code arrives | The bot cannot receive updates, so it cannot reply to the link that carries the code. Run `npm run telegram:webhook --status --workspace @virallink/api` — it prints Telegram's last delivery failure. If the URL is a tunnel that has restarted, re-register it. |
| Telegram calls time out | The API is slow to reach. `TELEGRAM_API_TIMEOUT_MS` defaults to 30000; raise it if the host is far away. |
| API returns 502 | Either the app is stopped or `API_INTERNAL_URL` is wrong. `curl http://127.0.0.1:4000/health` from Terminal. |
| `Module not found` after a Git pull | Run `npm install` again at the repository root. |
| Out of memory / process killed | Lower `DB_POOL_MAX` to 2 and `BCRYPT_ROUNDS` is not the cause — image processing is. Raise the host's memory limit or set `images.unoptimized = true` (already the default). |

---

## Security checklist

- [ ] `NODE_ENV=production`
- [ ] `DB_SYNC_ALLOWED=false` — **critical**. True in production can drop columns and destroy financial data. The API refuses to boot if it is true, but verify it is not set.
- [ ] `COOKIE_SECURE=true`
- [ ] `AUTO_MIGRATE=false` — **critical**. The API refuses to boot in production if it is true. Apply schema changes deliberately with **Run NPM Script → `npm run migrate`** before restarting.
- [ ] `AUTO_SEED=true` — the RBAC baseline seeder is idempotent and safe on every boot.
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
- [ ] `https://virallinkdigital.com/robots.txt` disallows `/vira-admin`

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