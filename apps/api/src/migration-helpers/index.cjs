'use strict';

/**
 * Migration helpers.
 *
 * Deliberately minimal. Migrations here spell out their own columns rather than
 * deriving DDL from the live models: a migration must describe the schema as it
 * was at the moment it was written, so editing a model must never retroactively
 * change what an already-run migration produces.
 */

const STRING_INDEX_MAX = 191;

/**
 * camelCase -> snake_case, matching the models' `underscored: true` setting.
 *
 * `queryInterface.createTable` uses the attribute keys in the attributes object
 * verbatim as column names, so writing `{ passwordHash: ... }` creates a column
 * literally named `passwordHash`. The models then look for `password_hash` and
 * every query fails. Passing keys through this function keeps migrations written
 * in the same camelCase style as the models while producing snake_case columns.
 */
function snakeCase(name) {
  return name.replace(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
}

/** Convert an attributes object's keys to snake_case column names. */
function toColumnNames(attributes) {
  return Object.fromEntries(Object.entries(attributes).map(([key, value]) => [snakeCase(key), value]));
}

/** Convert camelCase field names in an index or constraint definition. */
function toColumnFields(fields) {
  return fields.map(snakeCase);
}

/**
 * Common column definitions.
 *
 * These must be built *inside* `up()`, not at module scope: umzug passes the
 * Sequelize module as the second argument to `up(queryInterface, Sequelize)`, so
 * a top-level `Sequelize.BIGINT.UNSIGNED` would be evaluated at require time,
 * before the variable exists, and throw "Sequelize is not defined".
 */
function columns(Sequelize) {
  return {
    PK: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true, allowNull: false },
    createdAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('CURRENT_TIMESTAMP') },
    updatedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('CURRENT_TIMESTAMP') },
    deletedAt: { type: Sequelize.DATE, allowNull: true },
    // Money is always DECIMAL(14,2), never a float.
    DECIMAL: { type: Sequelize.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    tableOptions: { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
  };
}

/** Drop a table, tolerating a partially-applied rollback. */
async function dropTableIfExists(queryInterface, tableName) {
  await queryInterface.dropTable(tableName).catch(() => {});
}

/**
 * `queryInterface.createTable` with automatic camelCase -> snake_case conversion
 * of attribute keys, so migrations can be written in the same style as the models.
 * Table options default to utf8mb4.
 */
async function createTable(queryInterface, tableName, attributes, options = {}) {
  return queryInterface.createTable(
    tableName,
    toColumnNames(attributes),
    { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci', ...options },
  );
}

/** `queryInterface.addIndex` with automatic camelCase -> snake_case conversion. */
async function addIndex(queryInterface, tableName, fields, options = {}) {
  return queryInterface.addIndex(tableName, toColumnFields(fields), options);
}

/** `queryInterface.addConstraint` with automatic camelCase -> snake_case conversion. */
async function addConstraint(queryInterface, tableName, options = {}) {
  const converted = { ...options };
  if (Array.isArray(options.fields)) {
    converted.fields = toColumnFields(options.fields);
  }
  return queryInterface.addConstraint(tableName, converted);
}

/**
 * Create a many-to-many join table plus its two foreign keys.
 * Used for role_permissions, user_roles, blog_post_categories, etc.
 */
async function createJoinTable(queryInterface, Sequelize, tableName, { left, right, leftTable, rightTable }) {
  const { createdAt } = columns(Sequelize);

  await createTable(
    queryInterface,
    tableName,
    {
      [left]: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      [right]: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      createdAt,
    },
    undefined,
  );

  await addIndex(queryInterface, tableName, [left, right], { unique: true, name: `${tableName}_pair_unique` });
  for (const field of [left, right]) {
    await addIndex(queryInterface, tableName, [field], { name: `${tableName}_${snakeCase(field)}_idx` });
  }

  await addConstraint(queryInterface, tableName, {
    fields: [left],
    type: 'foreign key',
    name: `${tableName}_${snakeCase(left)}_fk`,
    references: { table: leftTable, field: 'id' },
    onDelete: 'CASCADE',
  });

  await addConstraint(queryInterface, tableName, {
    fields: [right],
    type: 'foreign key',
    name: `${tableName}_${snakeCase(right)}_fk`,
    references: { table: rightTable, field: 'id' },
    onDelete: 'CASCADE',
  });
}

/**
 * `queryInterface.addColumn` with camelCase -> snake_case conversion.
 *
 * Writing `addColumn` directly is a trap. MySQL column names are case-sensitive in
 * effect: `shootDate` and `shoot_date` are different columns, so a migration that
 * adds one and a model that expects the other leaves every query failing with
 * "Unknown column". This exists so migrations can be written in the same
 * camelCase style as the models.
 *
 * Tolerates an already-present column. MySQL commits DDL implicitly, so a
 * migration that fails partway leaves its earlier statements behind and is *not*
 * rolled back — the record in SequelizeMeta is never written, so the next run
 * retries and dies on "Duplicate column". Swallowing that specific error is what
 * makes a half-applied migration recoverable by simply running it again, which is
 * the only practical repair when there is no transaction to lean on.
 */
async function addColumn(queryInterface, tableName, attribute) {
  // `attribute` is a single-entry object: { shootDate: { type: ... } }. Running it
  // through toColumnNames yields the snake_case key with the definition untouched,
  // so one Object.entries destructure gives both halves.
  const [name, definition] = Object.entries(toColumnNames(attribute))[0];

  if (!name) throw new Error(`addColumn was called without a column name for ${tableName}`);

  try {
    await queryInterface.addColumn(tableName, name, definition);
  } catch (error) {
    if (!/duplicate column|already exists/i.test(error?.message || error?.sqlMessage || '')) throw error;
  }

  return name;
}

/** Add several columns in one call, all snake_case converted. */
async function addColumns(queryInterface, tableName, attributes) {
  const added = [];
  for (const [key, definition] of Object.entries(attributes)) {
    added.push(await addColumn(queryInterface, tableName, { [key]: definition }));
  }
  return added;
}

/**
 * `queryInterface.removeColumn`, tolerating a column that is already gone, so a
 * `down()` can be re-run after a partial failure.
 */
async function removeColumn(queryInterface, tableName, attributeName) {
  const name = snakeCase(attributeName);
  try {
    await queryInterface.removeColumn(tableName, name);
  } catch (error) {
    if (!/unknown column|does not exist/i.test(error?.message || error?.sqlMessage || '')) throw error;
  }
}

module.exports = {
  addColumn,
  addColumns,
  addConstraint,
  addIndex,
  columns,
  createJoinTable,
  createTable,
  dropTableIfExists,
  removeColumn,
  snakeCase,
  toColumnFields,
  toColumnNames,
  STRING_INDEX_MAX,
};