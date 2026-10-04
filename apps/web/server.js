/**
 * cPanel / Passenger entry point for the website.
 *
 * cPanel's "Setup Node.js App" asks for a startup *file*, not a command, so
 * `next start` cannot be expressed directly in that field. This wrapper is the
 * file it wants, and it does exactly what `next start` does internally: boot the
 * production Next server and hand every request to its request handler.
 *
 * Kept deliberately thin. It reads PORT and HOST from the environment because
 * Passenger assigns the port rather than letting the app choose it, and it
 * binds to loopback so the site is reachable only through Apache.
 *
 * `output: 'standalone'` is not used anywhere in this project — see
 * next.config.mjs. Passenger expects a real node_modules directory in the
 * application root, which standalone output strips down to a minimal bundle.
 */

// Passenger sets Application mode to Production; default it so `dev: false` is
// correct even when the variable is missing from the cPanel UI.
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const http = require('node:http');
const next = require('next');

const port = Number(process.env.PORT) || 3000;
// Loopback by default. Apache proxies to this port, so it should not be
// reachable from the internet. Override with HOST only if a reverse proxy
// terminates TLS in front of the app.
const host = process.env.HOST || '127.0.0.1';

const app = next({ dev: false });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => handle(req, res));

    server.listen(port, host, () => {
      // eslint-disable-next-line no-console
      console.log(`[web] ready on http://${host}:${port} (${process.env.NODE_ENV})`);
    });

    // Slow clients on shared hosting should not hold a socket open forever.
    server.keepAliveTimeout = 61000;
    server.headersTimeout = 65000;
    server.requestTimeout = 60000;

    let shuttingDown = false;

    const shutdown = (signal) => {
      if (shuttingDown) return;
      shuttingDown = true;
      // eslint-disable-next-line no-console
      console.log(`[web] ${signal} received, shutting down`);

      const forceExit = setTimeout(() => process.exit(1), 10000);
      forceExit.unref();

      server.close(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
    };

    // On Passenger, SIGTERM is how a restart is requested.
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[web] failed to start:', error);
    process.exit(1);
  });