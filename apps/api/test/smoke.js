/**
 * Smoke test: boot the app in-process and exercise the key endpoints.
 * Used to verify wiring without needing a separately running server.
 */
import { createApp } from '../src/app.js';
import sequelize from '../src/config/database.js';

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const results = [];

async function check(name, path, options = {}, expectation) {
  try {
    const response = await fetch(`${base}${path}`, options);
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    const ok = expectation ? expectation(response.status, body) : response.status < 400;
    results.push({ name, status: response.status, ok, detail: ok ? '' : JSON.stringify(body).slice(0, 200) });
    return body;
  } catch (error) {
    results.push({ name, status: 'ERR', ok: false, detail: error.message });
    return null;
  }
}

const json = (body) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

await check('health', '/health', {}, (s) => s === 200);
await check('api index', '/api/v1', {}, (s) => s === 200);
await check('public company', '/api/v1/public/company', {}, (s) => s === 200);
await check('public services', '/api/v1/public/services', {}, (s) => s === 200);
await check('public team', '/api/v1/public/team', {}, (s) => s === 200);
await check('public portfolio', '/api/v1/public/portfolio', {}, (s) => s === 200);
await check('public blog', '/api/v1/public/blog', {}, (s) => s === 200);
await check('public jobs', '/api/v1/public/jobs', {}, (s) => s === 200);
await check('contact nonce', '/api/v1/contact/nonce', {}, (s) => s === 200);

await check('contact validation rejects short message', '/api/v1/contact', json({ name: 'A', email: 'bad', message: 'hi' }), (s) => s === 422);
await check('contact accepts valid', '/api/v1/contact', json({
  name: 'Test Person',
  email: 'test@example.com',
  message: 'This is a sufficiently long enquiry message for testing purposes.',
}), (s) => s === 201);

// Unauthenticated admin access must be refused.
await check('admin employees requires auth', '/api/v1/employees', {}, (s) => s === 401);
await check('admin shareholders requires auth', '/api/v1/shareholders', {}, (s) => s === 401);
await check('admin finance requires auth', '/api/v1/finance/transactions', {}, (s) => s === 401);
await check('admin dashboard requires auth', '/api/v1/dashboard/summary', {}, (s) => s === 401);

await check('login rejects bad credentials', '/api/v1/auth/login', json({ email: 'nobody@example.com', password: 'wrong-password' }), (s) => s === 401);
await check('login rejects malformed', '/api/v1/auth/login', json({ email: 'not-an-email', password: 'x' }), (s) => s === 422);

await check('unknown route 404s', '/api/v1/nope', {}, (s) => s === 404);
await check('path traversal on media blocked', '/api/v1/media/../../.env', {}, (s) => s === 400 || s === 404);

console.log('\n=== API SMOKE TEST ===');
for (const result of results) {
  const mark = result.ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${result.name} -> ${result.status}${result.detail ? ` :: ${result.detail}` : ''}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

server.close();
await sequelize.close();
process.exit(failed ? 1 : 0);