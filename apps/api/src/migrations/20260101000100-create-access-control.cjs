'use strict';

/**
 * Access control: permissions, roles, users, their join tables, and the
 * server-side refresh-token revocation list.
 *
 * Runs first — every later migration references users.id.
 */

const { addConstraint, addIndex, columns, createJoinTable, createTable, dropTableIfExists } = require('../migration-helpers/index.cjs');


module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt, DECIMAL } = columns(Sequelize);

    await createTable(queryInterface, 
      'permissions',
      {
        id: PK,
        // Permission keys are the contract between the shared RBAC map and the
        // API middleware, e.g. "portfolio.write".
        key: { type: Sequelize.STRING(120), allowNull: false, unique: true },
        description: { type: Sequelize.STRING(191), allowNull: true },
        group: { type: Sequelize.STRING(60), allowNull: false, defaultValue: 'general' },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'permissions', ['group'], { name: 'permissions_group_idx' });

    await createTable(queryInterface, 
      'roles',
      {
        id: PK,
        key: { type: Sequelize.STRING(60), allowNull: false, unique: true },
        name: { type: Sequelize.STRING(120), allowNull: false },
        description: { type: Sequelize.STRING(191), allowNull: true },
        // System roles are seeded and referenced in code; they are not editable.
        isSystem: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    await createTable(queryInterface, 
      'users',
      {
        id: PK,
        name: { type: Sequelize.STRING(120), allowNull: false },
        email: { type: Sequelize.STRING(191), allowNull: false, unique: true },
        // bcrypt digest only. Plaintext passwords are never persisted.
        passwordHash: { type: Sequelize.STRING(120), allowNull: false },
        isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        lastLoginAt: { type: Sequelize.DATE, allowNull: true },
        // Incremented on password change; older access tokens then fail validation.
        tokenVersion: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        failedLoginAttempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        lockedUntil: { type: Sequelize.DATE, allowNull: true },
        passwordChangedAt: { type: Sequelize.DATE, allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'users', ['isActive'], { name: 'users_is_active_idx' });

    await createJoinTable(queryInterface, Sequelize, 'role_permissions', {
      left: 'roleId',
      right: 'permissionId',
      leftTable: 'roles',
      rightTable: 'permissions',
    });

    await createJoinTable(queryInterface, Sequelize, 'user_roles', {
      left: 'userId',
      right: 'roleId',
      leftTable: 'users',
      rightTable: 'roles',
    });

    // cPanel has no shared session store, so this table is the single source of
    // truth for "is this session still allowed to exist". Deleting or revoking a
    // row logs that session out on its next refresh.
    await createTable(queryInterface, 
      'refresh_tokens',
      {
        id: PK,
        userId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        // The jti claim of the refresh JWT, so one token cannot be replayed.
        tokenId: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        expiresAt: { type: Sequelize.DATE, allowNull: false },
        revokedAt: { type: Sequelize.DATE, allowNull: true },
        userAgent: { type: Sequelize.STRING(191), allowNull: true },
        ip: { type: Sequelize.STRING(191), allowNull: true },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'refresh_tokens', ['userId'], { name: 'refresh_tokens_user_idx' });
    await addIndex(queryInterface, 'refresh_tokens', ['expiresAt'], { name: 'refresh_tokens_expires_idx' });
    await addConstraint(queryInterface, 'refresh_tokens', {
      fields: ['userId'],
      type: 'foreign key',
      name: 'refresh_tokens_user_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'refresh_tokens');
    await dropTableIfExists(queryInterface, 'user_roles');
    await dropTableIfExists(queryInterface, 'role_permissions');
    await dropTableIfExists(queryInterface, 'users');
    await dropTableIfExists(queryInterface, 'roles');
    await dropTableIfExists(queryInterface, 'permissions');
  },
};