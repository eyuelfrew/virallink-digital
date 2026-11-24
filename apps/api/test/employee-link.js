/**
 * Employee and account alignment tests.
 *
 * A sign-in and an employee profile are two records for one person: the
 * account says what they may reach, the profile says what they do. These
 * tests cover the rules that keep the two from drifting apart:
 *
 *   1. a job title is carried across when a profile is created from an
 *      account, rather than being asked for a second time;
 *   2. a name is the same name in both records, whichever one is edited;
 *   3. both tables show both halves, so a drift would be visible.
 */
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

const { createApp } = await import('../src/app.js');
const { default: sequelize } = await import('../src/config/database.js');
const { default: env } = await import('../src/config/env.js');
const { default: bcrypt } = await import('bcrypt');
const { default: models } = await import('../src/models/index.js');
const { positionForRoles, roleForPosition } = await import('../src/shared/permissions.js');

const { User, Role, Employee, Department } = models;

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
}

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

/** Minimal cookie jar, so each identity keeps its own session. */
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

    return { status: response.status, body };
  };
}

const post = (payload) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

const put = (payload) => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
});

await sequelize.authenticate();

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                     */
/* -------------------------------------------------------------------------- */

const ADMIN_EMAIL = 'align.admin@virallink.test';
const ADMIN_PASSWORD = 'AlignAdmin123!';

const created = { users: [], employees: [], departments: [] };

async function makeUser(email, name, roleKey) {
  const existing = await User.findOne({ where: { email }, paranoid: false });

  if (existing) {
    if (existing.deletedAt) await existing.restore();
    await existing.update({
      name,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, env.BCRYPT_ROUNDS),
      isActive: true,
      employeeId: null,
    });
  } else {
    await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, env.BCRYPT_ROUNDS),
      isActive: true,
    });
  }

  const user = await User.findOne({ where: { email } });
  const role = await Role.findOne({ where: { key: roleKey } });
  if (!role) throw new Error(`Role ${roleKey} is missing — run "npm run seed" first`);
  await user.setRoles([role]);

  created.users.push(user.id);
  return user;
}

async function makeEmployee(name, position, departmentId = null) {
  const employee = await Employee.create({ name, position, departmentId, isPublic: false });
  created.employees.push(employee.id);
  return employee;
}

/**
 * The profile currently linked to an account.
 *
 * Re-read every time: the instance held from before the profile was created
 * carries a stale `employeeId`, and a stale id makes every assertion after it
 * quietly test the wrong row.
 */
async function linkedEmployeeId(userId) {
  const user = await User.findByPk(userId, { attributes: ['employeeId'] });
  return user?.employeeId ?? null;
}

const admin = await makeUser(ADMIN_EMAIL, 'Align Admin', 'SUPER_ADMIN');
const seo = await makeUser('align.seo@virallink.test', 'Search Person', 'SEO_SPECIALIST');
const chief = await makeUser('align.chief@virallink.test', 'Chief Person', 'SUPER_ADMIN');

// `findOrCreate` resolves to a tuple, so the record is the first element.
const [department] = await Department.findOrCreate({ where: { name: 'Alignment' } });
created.departments.push(department.id);

const adminClient = createClient();
const signedIn = await adminClient('/api/v1/auth/login', post({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }));
record('the administrator can sign in', signedIn.status === 200, `got ${signedIn.status}`);

/* -------------------------------------------------------------------------- */
/* 1. A job title is carried across, not asked for again                         */
/* -------------------------------------------------------------------------- */

const derived = await adminClient(`/api/v1/users/${seo.id}/employee`, post({
  name: seo.name,
  email: seo.email,
  departmentId: department.id,
}));

record('an employee profile is created from an account', derived.status === 201, `got ${derived.status} ${JSON.stringify(derived.body?.error || '')}`);

const seoEmployeeId = await linkedEmployeeId(seo.id);
const seoEmployee = await Employee.findByPk(seoEmployeeId);
record(
  'the job title comes from the account role',
  seoEmployee?.position === 'SEO Specialist',
  `position=${seoEmployee?.position}`,
);
record('the department is kept', String(seoEmployee?.departmentId) === String(department.id));
record('the name is carried across', seoEmployee?.name === seo.name);

/* An explicit position wins — the role describes access as much as the job. */

const video = await makeUser('align.video@virallink.test', 'Video Person', 'VIDEO_EDITOR');

const explicit = await adminClient(`/api/v1/users/${video.id}/employee`, post({
  name: video.name,
  position: 'Senior Motion Designer',
  departmentId: department.id,
}));

record('a profile with an explicit title is created', explicit.status === 201, `got ${explicit.status}`);

const videoEmployeeId = await linkedEmployeeId(video.id);
const videoEmployee = await Employee.findByPk(videoEmployeeId);
record(
  'an explicit job title wins over the derived one',
  videoEmployee?.position === 'Senior Motion Designer',
  `position=${videoEmployee?.position}`,
);

/* A role that names a level of access derives nothing. */

const chiefProfile = await adminClient(`/api/v1/users/${chief.id}/employee`, post({
  name: chief.name,
}));

record('a profile is created for an access-level role', chiefProfile.status === 201, `got ${chiefProfile.status}`);

const chiefEmployee = await Employee.findByPk(await linkedEmployeeId(chief.id));
record(
  'an access level is not turned into a job title',
  !chiefEmployee?.position,
  `position=${chiefEmployee?.position}`,
);

/* -------------------------------------------------------------------------- */
/* 2. The job title and the account role agree                                   */
/* -------------------------------------------------------------------------- */

record(
  'a job title maps back to the role that named it',
  roleForPosition('SEO Specialist') === 'SEO_SPECIALIST',
  `${roleForPosition('SEO Specialist')}`,
);

record(
  'a job title that names no role maps to nothing',
  roleForPosition('Head of Everything') === null,
  `${roleForPosition('Head of Everything')}`,
);

record(
  'an access-level role names no job',
  positionForRoles(['SUPER_ADMIN']) === null,
  `${positionForRoles(['SUPER_ADMIN'])}`,
);

/* -------------------------------------------------------------------------- */
/* 3. One person, one name, whichever record is edited                            */
/* -------------------------------------------------------------------------- */

const renameUser = await adminClient(`/api/v1/users/${seo.id}`, put({ name: 'Search Person Renamed' }));
record('the account is renamed', renameUser.status === 200, `got ${renameUser.status}`);

const afterUserRename = await Employee.findByPk(seoEmployeeId);
record(
  'the linked profile is renamed to match',
  afterUserRename?.name === 'Search Person Renamed',
  `name=${afterUserRename?.name}`,
);

const renameEmployee = await adminClient(`/api/v1/employees/${seoEmployeeId}`, put({ name: 'Search Person Again' }));
record('the profile is renamed', renameEmployee.status === 200, `got ${renameEmployee.status} ${JSON.stringify(renameEmployee.body?.error || '')}`);

const afterEmployeeRename = await User.findByPk(seo.id);
record(
  'the linked account is renamed to match',
  afterEmployeeRename?.name === 'Search Person Again',
  `name=${afterEmployeeRename?.name}`,
);

/* A request that renames and re-links must not rename the old profile. */

const other = await makeEmployee('Unrelated Person', 'Designer');
const relink = await adminClient(`/api/v1/users/${seo.id}`, put({
  name: 'Search Person Third',
  employeeId: other.id,
}));
record('the account is renamed and re-linked', relink.status === 200, `got ${relink.status}`);

const oldProfile = await Employee.findByPk(seoEmployeeId);
record(
  'the profile it left behind is not renamed',
  oldProfile?.name === 'Search Person Again',
  `name=${oldProfile?.name}`,
);

/* -------------------------------------------------------------------------- */
/* 4. Both tables show both halves                                                */
/* -------------------------------------------------------------------------- */

const usersList = await adminClient('/api/v1/users?pageSize=100');
const listedUser = (usersList.body?.data || []).find((u) => Number(u.id) === Number(video.id));

record('the users list carries the job title', listedUser?.employeePosition === 'Senior Motion Designer', `${listedUser?.employeePosition}`);
record('the users list carries the department', Boolean(listedUser?.employeeDepartment), `${listedUser?.employeeDepartment}`);
record('the users list carries the role', (listedUser?.roles || []).includes('VIDEO_EDITOR'));

const employeesList = await adminClient('/api/v1/employees?pageSize=100');
const listedEmployee = (employeesList.body?.data || []).find((e) => Number(e.id) === Number(videoEmployeeId));

record('the employees list carries the position', listedEmployee?.position === 'Senior Motion Designer');
record(
  'the employees list carries the account role',
  (listedEmployee?.login?.roles || []).includes('VIDEO_EDITOR'),
  JSON.stringify(listedEmployee?.login?.roles),
);

/* -------------------------------------------------------------------------- */
/* 5. A second profile is refused                                                */
/* -------------------------------------------------------------------------- */

const second = await adminClient(`/api/v1/users/${video.id}/employee`, post({ name: 'Another One' }));
record('a second profile for the same account is refused', second.status === 409, `got ${second.status}`);

/* -------------------------------------------------------------------------- */
/* Cleanup                                                                       */
/* -------------------------------------------------------------------------- */

for (const id of created.employees) await Employee.destroy({ where: { id }, force: true });
for (const id of created.users) await User.destroy({ where: { id }, force: true });

/* -------------------------------------------------------------------------- */
/* Report                                                                        */
/* -------------------------------------------------------------------------- */

console.log('\n=== EMPLOYEE AND ACCOUNT ALIGNMENT TESTS ===');
for (const result of results) {
  console.log(`[${result.ok ? 'PASS' : 'FAIL'}] ${result.name}${result.detail ? ` :: ${result.detail}` : ''}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);

server.close();
await sequelize.close();
process.exit(failed ? 1 : 0);
