/* Temporary end-to-end validation of the My Tasks feature:
   1. mint a session token (read-only DB access)
   2. GET /api/v1/tasks/mine  -> unlinked shape
   3. PUT /api/v1/users/:id { employeeId } (through the real API) -> linked shape
   4. PUT /api/v1/users/:id { employeeId: null } -> unlink again (restores state)
   5. GET the SSR page /vira-admin/my-tasks -> status + markup checks
   Delete after use. */
const fs = require('fs');
const mysql = require('mysql2/promise');
const { SignJWT } = require('jose');

const ROOT = __dirname;
const env = {};
for (const line of fs.readFileSync(`${ROOT}/.env`, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`);
};

(async () => {
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME,
  });
  const [rows] = await db.query(
    'SELECT id, token_version, is_active, email FROM users WHERE id = 1 AND is_active = 1',
  );
  await db.end();
  if (!rows.length) throw new Error('user id=1 not found');
  const user = rows[0];
  console.log(`session: user id=${user.id} ${user.email}`);

  const key = new TextEncoder().encode(env.JWT_SECRET);
  const token = await new SignJWT({ typ: 'access', roles: [], tv: Number(user.token_version) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(user.id))
    .setIssuer('virallink-api')
    .setIssuedAt()
    .setExpirationTime('15m')
    .setJti('mytasks-validation')
    .sign(key);

  const cookie = `vl_access=${token}`;
  const api = (env.API_INTERNAL_URL || 'http://127.0.0.1:4000').replace(/\/+$/, '');

  const apiGet = async (path) => {
    const res = await fetch(`${api}/api/v1${path}`, { headers: { cookie } });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };
  const apiSend = async (path, method, payload) => {
    const res = await fetch(`${api}/api/v1${path}`, {
      method,
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  };

  // Ensure a clean starting state for the link.
  await apiSend('/users/1', 'PUT', { employeeId: null });

  /* 1. unlinked */
  console.log('\n[1] GET /tasks/mine while unlinked');
  const unlinked = await apiGet('/tasks/mine');
  check('endpoint exists and authorises', unlinked.status === 200, `status=${unlinked.status}`);
  check(
    'reports linked:false with empty payload',
    unlinked.body?.data?.linked === false && (unlinked.body?.data?.tasks || []).length === 0,
    JSON.stringify(unlinked.body?.data?.counts),
  );

  /* 2. link through the real API (exercises schema + service validation) */
  console.log('\n[2] PUT /users/1 { employeeId: 2 } via the API');
  const badLink = await apiSend('/users/1', 'PUT', { employeeId: 999999 });
  check('rejects a non-existent employee', badLink.status === 400 || badLink.status === 422, `status=${badLink.status}`);

  const link = await apiSend('/users/1', 'PUT', { employeeId: 2 });
  check('links user to employee id=2', link.status === 200 && link.body?.data?.employeeId === 2, `status=${link.status} employeeName=${link.body?.data?.employeeName}`);

  /* 3. linked read */
  console.log('\n[3] GET /tasks/mine while linked');
  const linked = await apiGet('/tasks/mine');
  check('reports linked:true', linked.body?.data?.linked === true, JSON.stringify(linked.body?.data?.employee));
  check('counts shape present', Boolean(linked.body?.data?.counts && linked.body?.data?.counts.byStatus !== undefined));

  /* 4. session carries the link */
  const me = await apiGet('/auth/me');
  check('session exposes employeeId', me.body?.data?.user?.employeeId === 2, `employeeId=${me.body?.data?.user?.employeeId}`);

  /* 5. SSR page */
  console.log('\n[4] GET /vira-admin/my-tasks (SSR)');
  const page = await fetch('http://localhost:3000/vira-admin/my-tasks', {
    headers: { cookie },
    redirect: 'manual',
    signal: AbortSignal.timeout(90000),
  });
  const html = await page.text();
  check('page renders 200', page.status === 200, `status=${page.status}`);
  check('My tasks nav present in shell', html.includes('/vira-admin/my-tasks') && html.includes('My tasks'));
  check(
    'board or empty state rendered',
    html.includes('All caught up') || html.includes('aria-label=') || html.includes('Nothing here'),
  );
  check('no runtime error', !/Application error|Unhandled Runtime Error/.test(html));

  /* 6. settings/users shows the link */
  console.log('\n[5] GET /vira-admin/settings/users (SSR)');
  const usersPage = await fetch('http://localhost:3000/vira-admin/settings/users', {
    headers: { cookie },
    redirect: 'manual',
    signal: AbortSignal.timeout(90000),
  });
  const usersHtml = await usersPage.text();
  check('users page renders 200', usersPage.status === 200, `status=${usersPage.status}`);
  check('employee column present', usersHtml.includes('Employee'));
  check('linked name rendered', usersHtml.includes('sara'), 'employee id=2 name appears');

  /* restore state */
  console.log('\n[restore] unlink user 1');
  const unlink = await apiSend('/users/1', 'PUT', { employeeId: null });
  check('unlink restores employeeId null', unlink.status === 200 && unlink.body?.data?.employeeId === null, `status=${unlink.status}`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${failed.length === 0 ? 'ALL CHECKS PASSED' : `${failed.length} CHECK(S) FAILED`}`);
  if (failed.length) process.exitCode = 1;
})().catch((e) => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
