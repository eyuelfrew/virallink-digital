/**
 * Create the first administrator.
 *
 * Interactive when run without arguments, so a password typed during setup is
 * never passed on a command line where it would land in shell history.
 *
 * Usage:
 *   npm run create:admin --workspace @virallink/api
 *   npm run create:admin -- -- --name "A Name" --email a@b.com --role SUPER_ADMIN
 */
import readline from 'node:readline/promises';
import bcrypt from 'bcrypt';
import env from '../config/env.js';
import sequelize from '../config/database.js';
import { models } from '../models/index.js';
import { ROLES } from '@virallink/shared/enums';
import { passwordSchema, WEAK_PASSWORDS } from '@virallink/shared/schemas';
import { recordActivity } from '../middleware/audit.js';

const { User, Role, Permission } = models;

/** Parse `--name "x" --email y` style arguments. */
function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
}

/** Ask again on an invalid password, up to a few attempts. */
async function promptForPassword(rl, label, { confirm = true } = {}) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const value = await rl.question(`${label}: `, { hideEchoBack: true });

    if (confirm) {
      const again = await rl.question(`${label} (confirm): `, { hideEchoBack: true });
      if (value !== again) {
        console.error('Those did not match. Try again.');
        continue;
      }
    }

    const result = passwordSchema.safeParse(value);
    if (!result.success) {
      for (const issue of result.error.issues) console.error(`  - ${issue.message}`);
      continue;
    }

    return value;
  }

  console.error('\nGiving up after 5 invalid attempts. No account was created.');
  process.exit(1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const useCli = Boolean(args.email);

  let name = args.name;
  let email = args.email;
  let role = args.role || ROLES.SUPER_ADMIN;
  let password = args.password;

  if (!useCli) {
    console.log('\nVirallink — create an administrator account\n');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    name = (await rl.question('Full name: ')).trim();
    email = (await rl.question('Email: ')).trim().toLowerCase();
    role = (await rl.question(`Role [${Object.values(ROLES).join(' / ')}]: `)).trim() || ROLES.SUPER_ADMIN;
    password = await promptForPassword(rl, 'Password');
    rl.close();
  }

  if (!name || !email) {
    console.error('Both a name and an email are required.');
    process.exit(1);
  }

  if (!password) {
    console.error('\nRefusing to accept a password on the command line.\nRun without --password and type it at the prompt instead.');
    process.exit(1);
  }

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    console.error('\nPassword does not meet the requirements:');
    for (const issue of parsed.error.issues) console.error(`  - ${issue.message}`);
    console.error(`\nAt least 12 characters, mixing upper case, lower case and a number.`);
    console.error(`These are rejected outright: ${WEAK_PASSWORDS.slice(0, 6).join(', ')}, ...`);
    process.exit(1);
  }

  if (!Object.values(ROLES).includes(role)) {
    console.error(`Unknown role "${role}". Use one of: ${Object.values(ROLES).join(', ')}`);
    process.exit(1);
  }

  await sequelize.authenticate();

  // The role and its permissions come from the seeder; if it has not been run,
  // createAdmin cannot grant anything and should say so rather than silently
  // making an account with no permissions.
  const roleRow = await Role.findOne({ where: { key: role }, include: [{ model: Permission, as: 'permissions' }] });
  if (!roleRow) {
    console.error(`\nRole "${role}" does not exist. Run "npm run seed" first.`);
    process.exit(1);
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    console.error(`\nA user with the email ${email} already exists.`);
    process.exit(1);
  }

  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS),
    isActive: true,
    tokenVersion: 0,
  });

  await user.setRoles([roleRow]);

  await recordActivity({
    userId: user.id,
    userEmail: user.email,
    action: 'create',
    entity: 'user',
    entityId: user.id,
    metadata: { role, via: 'createAdmin script' },
  });

  console.log(`\nCreated ${role} account: ${email}`);
  console.log(`Granted ${roleRow.permissions.length} permissions.`);
  console.log(`Sign in at /admin-teftef/login\n`);

  await sequelize.close();
  process.exit(0);
}

main().catch((error) => {
  console.error(`\nFailed: ${error.message}\n`);
  process.exit(1);
});