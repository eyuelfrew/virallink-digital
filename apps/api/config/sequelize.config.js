import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import env from '../src/config/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * sequelize-cli configuration.
 *
 * On cPanel there is no CLI shell, so migrations run from the "Setup Node.js
 * App" UI via `npm run migrate`, which invokes sequelize-cli with this file and
 * the explicit --migrations-path / --seeders-path flags defined in package.json.
 * Those flags are required: this CLI version resolves migration paths from argv
 * or ./migrations, and ignores a `migrations.path` key in this file.
 *
 * The shape below must stay env-keyed. sequelize-cli passes this object straight
 * to `new Sequelize(...)` unless it finds a key matching --env, so a flat config
 * without env keys fails with "Dialect needs to be explicitly supplied".
 */
function dialectConfig() {
  return {
    dialect: env.DB_DIALECT,
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      underscored: true,
    },
    dialectOptions: {
      connectTimeout: 10000,
      charset: 'utf8mb4',
    },
    logging: env.DB_LOG_QUERIES ? console.log : false,
    pool: { max: env.DB_POOL_MAX, min: 0, acquire: 30000, idle: 10000 },
  };
}

export default {
  development: dialectConfig(),
  test: dialectConfig(),
  production: dialectConfig(),
  // Retained for reference; the CLI uses the env-keyed entries above.
  _paths: {
    migrations: path.resolve(here, '../src/migrations'),
    seeders: path.resolve(here, '../src/seeders'),
  },
};