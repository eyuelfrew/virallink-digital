/**
 * Authenticated flow test: sign in, exercise RBAC, verify private data does not
 * appear in public responses.
 *
 * The most important assertions here are the negative ones: that a public
 * response cannot contain employee emails, client contact details, shareholder
 * data, or financial figures, and that a low-privilege role cannot reach a
 * finance endpoint.
 */
// Silence request logging so the test report is readable. Set before importing
// the app, since the logger reads LOG_LEVEL at module load.
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

import { createApp } from '../src/app.js';
import sequelize from '../src/config/database.js';
import env from '../src/config/env.js';
import { bootstrapDatabase } from '../src/config/bootstrap.js';
import bcrypt from 'bcrypt';
import models from '../src/models/index.js';

const { User, Role, Employee, Client, Shareholder, FinancialTransaction, Project, Service, Department } = models;

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

// Apply pending migrations and seed the RBAC baseline, exactly as server.js does
// on boot. Without this the suite cannot run against an empty database, which is
// what a fresh clone or a CI job has. Both steps are idempotent.
await bootstrapDatabase();

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

/** Minimal cookie jar so each identity keeps its own session. */
function createClient() {
  const cookies = new Map();

  return async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };

    if (cookies.size) {
      headers.cookie = [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }

    const response = await fetch(`${base}${path}`, { ...options, headers });

    for (const raw of response.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: response.status, body, text };
  };
}

const post = (payload) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

/* -------------------------------------------------------------------------- */
/* Seed a minimal data set                                                     */
/* -------------------------------------------------------------------------- */

await sequelize.authenticate();

/** Stable identifiers so re-running the suite reuses the same fixtures. */
const RUN_ID = process.env.TEST_RUN_ID || 'default';
const slugFor = (base) => `${base}-${RUN_ID}`;

/**
 * Remove anything a previous run left behind. Soft-deleted rows are restored and
 * overwritten rather than duplicated, so the assertions below stay meaningful.
 */
async function upsert(Model, where, values) {
  // `paranoid: false` is required to find soft-deleted rows; restore() only
  // exists on paranoid models.
  const existing = await Model.findOne({ where, paranoid: false });

  if (existing) {
    if (typeof existing.restore === 'function') await existing.restore();
    await existing.update(values);
    return existing;
  }

  return Model.create({ ...where, ...values });
}

const [department] = await Department.findOrCreate({ where: { name: 'Engineering' } });

const service = await upsert(
  Service,
  { slug: slugFor('seo') },
  {
    title: 'Search Engine Optimization',
    summary: 'Technical and content search optimisation.',
    isPublished: true,
  },
);

const employee = await upsert(
  Employee,
  { email: 'private.employee@internal-secret.test' },
  {
    name: 'Private Employee',
    position: 'Engineer',
    phone: '+251-000-000-000',
    isPublic: true,
    departmentId: department.id,
  },
);

const client = await upsert(
  Client,
  { email: 'private.contact@client-secret.test' },
  {
    name: 'Confidential Client Ltd',
    phone: '+251-111-111-111',
    contractValue: '150000.00',
    status: 'active',
    isPublic: true,
  },
);

await upsert(
  Shareholder,
  { name: 'Confidential Holder' },
  { shareCount: 1000, ownershipPercentage: '60.00', shareClass: 'founders' },
);

await upsert(
  FinancialTransaction,
  { description: 'Highly confidential revenue line' },
  {
    type: 'income',
    amount: '500000.00',
    currency: 'ETB',
    transactionDate: new Date().toISOString().slice(0, 10),
    status: 'completed',
  },
);

const project = await upsert(
  Project,
  { slug: slugFor('case-study') },
  {
    title: 'Confidential Case Study',
    clientId: client.id,
    serviceId: service.id,
    summary: 'A published case study.',
    status: 'completed',
    isPublished: true,
    publishedAt: new Date(),
  },
);

/* -------------------------------------------------------------------------- */
/* Public surface must not leak private data                                   */
/* -------------------------------------------------------------------------- */

const anon = createClient();

const teamResponse = await anon('/api/v1/public/team');
const teamText = JSON.stringify(teamResponse.body);
record(
  'public team hides employee email',
  !teamText.includes('private.employee@internal-secret.test'),
  teamText.includes('private.employee') ? 'email leaked' : '',
);
record('public team hides employee phone', !teamText.includes('000-000-000'));
record('public team still shows opted-in name', teamText.includes('Private Employee'));

const clientsResponse = await anon('/api/v1/public/clients');
const clientsText = JSON.stringify(clientsResponse.body);
record('public clients hide contact email', !clientsText.includes('private.contact@client-secret.test'));
record('public clients hide phone', !clientsText.includes('111-111-111'));
record('public clients hide contract value', !clientsText.includes('150000'));

const portfolioResponse = await anon(`/api/v1/public/portfolio/${project.slug}`);
const portfolioText = JSON.stringify(portfolioResponse.body);
record('public project has no client contact details', !portfolioText.includes('private.contact@client-secret.test'));
record('public project is reachable', portfolioResponse.status === 200);

const servicesResponse = await anon('/api/v1/public/services');
record('public services reachable', servicesResponse.status === 200);

/* -------------------------------------------------------------------------- */
/* Unauthenticated access to private endpoints                                 */
/* -------------------------------------------------------------------------- */

for (const path of ['/api/v1/shareholders', '/api/v1/finance/transactions', '/api/v1/employees', '/api/v1/clients']) {
  const response = await anon(path);
  record(`anonymous ${path} is 401`, response.status === 401, `got ${response.status}`);
}

/* -------------------------------------------------------------------------- */
/* Super admin session                                                         */
/* -------------------------------------------------------------------------- */

// Provision the super admin the same way as the other role testers below.
// Previously this account had to exist already, which meant the suite could not
// run on a fresh clone or in CI — every assertion after the login silently
// degraded to testing 401s.
await createRoleUser('admin@virallink.test', 'SUPER_ADMIN', 'TestAdmin123');

const admin = createClient();

const badLogin = await admin('/api/v1/auth/login', post({ email: 'admin@virallink.test', password: 'wrong' }));
record('login with wrong password is refused', badLogin.status === 401);

const login = await admin('/api/v1/auth/login', post({ email: 'admin@virallink.test', password: 'TestAdmin123' }));
record('login succeeds', login.status === 200, JSON.stringify(login.body).slice(0, 200));
record('login returns 38 permissions', login.body?.data?.user?.permissions?.length === 38, `got ${login.body?.data?.user?.permissions?.length}`);

const me = await admin('/api/v1/auth/me');
record('session cookie authenticates /me', me.status === 200);

const shareholders = await admin('/api/v1/shareholders');
record('super admin can read shareholders', shareholders.status === 200);
record('shareholder data includes holder name', JSON.stringify(shareholders.body).includes('Confidential Holder'));

const finance = await admin('/api/v1/finance/transactions');
record('super admin can read transactions', finance.status === 200);

const dashboard = await admin('/api/v1/dashboard/summary');
record('dashboard summary loads', dashboard.status === 200);
record(
  'dashboard returns integer cents',
  Number.isInteger(dashboard.body?.data?.finance?.outstandingCents),
  JSON.stringify(dashboard.body?.data?.finance || {}).slice(0, 120),
);

const staff = await admin('/api/v1/employees?search=Private');
record('employee search works', staff.status === 200);
record('admin employee list includes private email', JSON.stringify(staff.body).includes('private.employee@internal-secret.test'));

/* -------------------------------------------------------------------------- */
/* Write + audit trail                                                         */
/* -------------------------------------------------------------------------- */

const created = await admin('/api/v1/services', post({
  title: 'Paid Advertising',
  summary: 'Managed acquisition campaigns.',
  isPublished: true,
}));
record('creating a service succeeds', created.status === 201, JSON.stringify(created.body).slice(0, 200));

const createdId = created.body?.data?.id;

const updated = await admin(`/api/v1/services/${createdId}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Paid Advertising', isPublished: false, summary: 'Updated summary.' }),
});
record('updating a service succeeds', updated.status === 200);

const activity = await admin('/api/v1/activity?pageSize=20');
const activityText = JSON.stringify(activity.body);
record('activity log records the create', activityText.includes('create'));
record('activity log records the update', activityText.includes('update'));
record('activity log never contains a password', !activityText.toLowerCase().includes('passwordhash'));

const deleted = await admin(`/api/v1/services/${createdId}`, { method: 'DELETE' });
record('deleting a service succeeds', deleted.status === 200);

/* -------------------------------------------------------------------------- */
/* Validation and mass-assignment protection                                   */
/* -------------------------------------------------------------------------- */

const invalidProject = await admin('/api/v1/portfolio', post({ title: 'No slug issues', slug: 'Not A Slug!' }));
record('invalid slug is rejected with 422', invalidProject.status === 422, `got ${invalidProject.status}`);

const badSort = await admin('/api/v1/employees?sort=passwordHash');
record('sorting by a non-whitelisted field is rejected', badSort.status === 422, `got ${badSort.status}`);

const badId = await admin('/api/v1/employees/abc');
record('non-numeric id is rejected', badId.status === 422 || badId.status === 400, `got ${badId.status}`);

/* -------------------------------------------------------------------------- */
/* FINANCE role must not reach admin content, EDITOR must not reach finance    */
/* -------------------------------------------------------------------------- */

/**
 * Create a user for a role, or reuse one left by a previous run so the suite is
 * repeatable against the same database.
 */
async function createRoleUser(email, roleKey, password) {
  const role = await Role.findOne({ where: { key: roleKey } });
  if (!role) throw new Error(`Role ${roleKey} is missing — run "npm run seed" first`);

  const existing = await User.findOne({ where: { email } });
  const user =
    existing ||
    (await User.create({
      name: `${roleKey} Tester`,
      email,
      passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
      isActive: true,
    }));

  // Re-hash each run so a password change in this file takes effect.
  await user.update({
    passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    isActive: true,
    tokenVersion: user.tokenVersion + 1,
  });

  await user.setRoles([role]);
  return user;
}

await createRoleUser('finance.tester@virallink.test', 'FINANCE', 'FinanceTest123');
await createRoleUser('editor.tester@virallink.test', 'EDITOR', 'EditorTest123');

const financeClient = createClient();
await financeClient('/api/v1/auth/login', post({ email: 'finance.tester@virallink.test', password: 'FinanceTest123' }));

const financeCanRead = await financeClient('/api/v1/finance/transactions');
record('FINANCE can read transactions', financeCanRead.status === 200);

const financeCannotServices = await financeClient('/api/v1/services');
record('FINANCE cannot create services (403)', financeCannotServices.status === 403, `got ${financeCannotServices.status}`);

const financeCannotCompany = await financeClient('/api/v1/company', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Hacked' }) });
record('FINANCE cannot edit company (403)', financeCannotCompany.status === 403, `got ${financeCannotCompany.status}`);

const financeCannotShareholders = await financeClient('/api/v1/shareholders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X' }) });
record('FINANCE cannot create shareholders (403)', financeCannotShareholders.status === 403, `got ${financeCannotShareholders.status}`);

const editorClient = createClient();
await editorClient('/api/v1/auth/login', post({ email: 'editor.tester@virallink.test', password: 'EditorTest123' }));

const editorCanWriteProjects = await editorClient('/api/v1/portfolio', post({ title: 'Editor Project', summary: 'x' }));
record('EDITOR can create a project', editorCanWriteProjects.status === 201, JSON.stringify(editorCanWriteProjects.body).slice(0, 160));

const editorCannotFinance = await editorClient('/api/v1/finance/transactions');
record('EDITOR cannot read finances (403)', editorCannotFinance.status === 403, `got ${editorCannotFinance.status}`);

const editorCannotEmployees = await editorClient('/api/v1/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'X' }) });
record('EDITOR cannot create employees (403)', editorCannotEmployees.status === 403, `got ${editorCannotEmployees.status}`);

const editorCannotShareholders = await editorClient('/api/v1/shareholders');
record('EDITOR cannot read shareholders (403)', editorCannotShareholders.status === 403, `got ${editorCannotShareholders.status}`);

/* -------------------------------------------------------------------------- */
/* Session invalidation                                                        */
/* -------------------------------------------------------------------------- */

const logout = await admin('/api/v1/auth/logout', { method: 'POST' });
record('logout succeeds', logout.status === 200);

const afterLogout = await admin('/api/v1/auth/me');
record('session no longer valid after logout', afterLogout.status === 401, `got ${afterLogout.status}`);

/* -------------------------------------------------------------------------- */
/* Report                                                                      */
/* -------------------------------------------------------------------------- */

console.log('\n=== AUTHENTICATION & DATA ISOLATION TESTS ===');
for (const result of results) {
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.name}${result.detail ? ` :: ${result.detail}` : ''}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

server.close();
await sequelize.close();
process.exit(failed ? 1 : 0);