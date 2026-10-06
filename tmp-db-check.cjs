/* Temporary validation: confirm the users.employee_id migration applied and the
   new column/index/FK exist. Read-only. Delete after use. */
const fs = require('fs');
const mysql = require('mysql2/promise');

const env = {};
for (const line of fs.readFileSync(`${__dirname}/.env`, 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
  if (m) env[m[1]] = m[2];
}

(async () => {
  const db = await mysql.createConnection({
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME,
  });

  const [cols] = await db.query("SHOW COLUMNS FROM users LIKE 'employee_id'");
  console.log('employee_id column:', cols.length ? JSON.stringify(cols[0]) : 'MISSING');

  const [idx] = await db.query("SHOW INDEX FROM users WHERE Key_name = 'users_employee_idx'");
  console.log('users_employee_idx:', idx.length ? 'present' : 'MISSING');

  const [fks] = await db.query(
    "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'employee_id' AND REFERENCED_TABLE_NAME = 'employees'",
    [env.DB_NAME],
  );
  console.log('FK to employees:', fks.length ? fks[0].CONSTRAINT_NAME : 'MISSING');

  const [meta] = await db.query(
    'SELECT name FROM SequelizeMeta WHERE name LIKE ?',
    ['%add-user-employee-link%'],
  );
  console.log('SequelizeMeta row:', meta.length ? meta[0].name : 'MISSING');

  const [users] = await db.query('SELECT id, name, email, employee_id FROM users');
  console.log('users:', JSON.stringify(users));

  const [emps] = await db.query('SELECT id, name, email FROM employees ORDER BY id');
  console.log('employees:', JSON.stringify(emps));

  const [taskCount] = await db.query(
    "SELECT status, COUNT(*) AS n FROM tasks GROUP BY status",
  );
  console.log('tasks by status:', JSON.stringify(taskCount));

  await db.end();
})().catch((e) => {
  console.error('CHECK FAILED:', e.message);
  process.exit(1);
});
