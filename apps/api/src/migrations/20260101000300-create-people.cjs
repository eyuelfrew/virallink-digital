'use strict';

/**
 * People: departments, employees and shareholders.
 *
 * Shareholder data is confidential by design. There is no public API endpoint for
 * this table, and the public website never queries it.
 */

const { addConstraint, addIndex, columns, createJoinTable, createTable, dropTableIfExists } = require('../migration-helpers/index.cjs');


module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt, DECIMAL } = columns(Sequelize);

    await createTable(queryInterface, 
      'departments',
      {
        id: PK,
        name: { type: Sequelize.STRING(120), allowNull: false, unique: true },
        description: { type: Sequelize.STRING(500), allowNull: true },
        displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );

    await createTable(queryInterface, 
      'employees',
      {
        id: PK,
        name: { type: Sequelize.STRING(160), allowNull: false },
        position: { type: Sequelize.STRING(191), allowNull: true },
        departmentId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        biography: { type: Sequelize.TEXT, allowNull: true },
        photoMediaId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        // Admin-only columns. Public serializers use an allowlist that excludes
        // these three, so direct contact details never leak to the website.
        email: { type: Sequelize.STRING(191), allowNull: true },
        phone: { type: Sequelize.STRING(60), allowNull: true },
        linkedinUrl: { type: Sequelize.STRING(255), allowNull: true },
        employmentStatus: {
          type: Sequelize.ENUM('active', 'on_leave', 'inactive'),
          allowNull: false,
          defaultValue: 'active',
        },
        joinedAt: { type: Sequelize.DATEONLY, allowNull: true },
        displayOrder: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        // An employee is hidden from the website until an admin opts them in.
        isPublic: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'employees', ['isPublic', 'displayOrder'], { name: 'employees_public_idx' });
    await addIndex(queryInterface, 'employees', ['employmentStatus'], { name: 'employees_status_idx' });
    await addConstraint(queryInterface, 'employees', {
      fields: ['departmentId'],
      type: 'foreign key',
      name: 'employees_department_fk',
      references: { table: 'departments', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'employees', {
      fields: ['photoMediaId'],
      type: 'foreign key',
      name: 'employees_photo_fk',
      references: { table: 'media', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 
      'shareholders',
      {
        id: PK,
        name: { type: Sequelize.STRING(160), allowNull: false },
        shareClass: {
          type: Sequelize.ENUM('ordinary', 'preferred', 'founders'),
          allowNull: false,
          defaultValue: 'ordinary',
        },
        shareCount: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
        ownershipPercentage: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        joinedAt: { type: Sequelize.DATEONLY, allowNull: true },
        status: {
          type: Sequelize.ENUM('active', 'inactive', 'exited'),
          allowNull: false,
          defaultValue: 'active',
        },
        notes: { type: Sequelize.TEXT, allowNull: true },
        // Self-reference, so a holding entity can itself appear as a shareholder.
        parentId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'shareholders', ['status'], { name: 'shareholders_status_idx' });
    await addConstraint(queryInterface, 'shareholders', {
      fields: ['parentId'],
      type: 'foreign key',
      name: 'shareholders_parent_fk',
      references: { table: 'shareholders', field: 'id' },
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'shareholders');
    await dropTableIfExists(queryInterface, 'employees');
    await dropTableIfExists(queryInterface, 'departments');
  },
};