'use strict';

/**
 * Finance: categories, transactions, invoices, invoice line items and payments.
 *
 * Every monetary column is DECIMAL(14,2). Values are converted to integer cents
 * in the service layer, so no float arithmetic is ever applied to a balance.
 * Invoice totals are recalculated inside the same transaction that writes the
 * line items, so an invoice is never left with a stale total.
 */

const { addConstraint, addIndex, columns, createJoinTable, createTable, dropTableIfExists } = require('../migration-helpers/index.cjs');


module.exports = {
  async up(queryInterface, Sequelize) {
    const { PK, createdAt, updatedAt, deletedAt, DECIMAL } = columns(Sequelize);

    await createTable(queryInterface, 
      'financial_categories',
      {
        id: PK,
        name: { type: Sequelize.STRING(120), allowNull: false },
        // Categories are typed, so income and expense lists stay separate.
        type: { type: Sequelize.ENUM('income', 'expense'), allowNull: false },
        // System categories are the sensible defaults; admins may add more.
        isSystem: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'financial_categories', ['type', 'name'], { name: 'financial_categories_type_idx' });

    await createTable(queryInterface, 
      'financial_transactions',
      {
        id: PK,
        type: { type: Sequelize.ENUM('income', 'expense'), allowNull: false },
        amount: DECIMAL,
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'ETB' },
        categoryId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        clientId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        projectId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        description: { type: Sequelize.STRING(500), allowNull: false },
        transactionDate: { type: Sequelize.DATEONLY, allowNull: false },
        paymentMethod: {
          type: Sequelize.ENUM('bank_transfer', 'cash', 'cheque', 'mobile_money', 'card', 'other'),
          allowNull: true,
        },
        reference: { type: Sequelize.STRING(191), allowNull: true },
        status: {
          type: Sequelize.ENUM('pending', 'completed', 'failed', 'refunded'),
          allowNull: false,
          defaultValue: 'completed',
        },
        notes: { type: Sequelize.STRING(2000), allowNull: true },
        createdById: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    // Matches the shape of the dashboard's date-range aggregation.
    await addIndex(queryInterface, 'financial_transactions', ['transactionDate'], {
      name: 'financial_tx_date_idx',
    });
    await addIndex(queryInterface, 'financial_transactions', ['type', 'status', 'transactionDate'], {
      name: 'financial_tx_report_idx',
    });
    await addIndex(queryInterface, 'financial_transactions', ['clientId'], { name: 'financial_tx_client_idx' });
    await addIndex(queryInterface, 'financial_transactions', ['categoryId'], { name: 'financial_tx_category_idx' });
    await addConstraint(queryInterface, 'financial_transactions', {
      fields: ['categoryId'],
      type: 'foreign key',
      name: 'financial_tx_category_fk',
      references: { table: 'financial_categories', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'financial_transactions', {
      fields: ['clientId'],
      type: 'foreign key',
      name: 'financial_tx_client_fk',
      references: { table: 'clients', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'financial_transactions', {
      fields: ['projectId'],
      type: 'foreign key',
      name: 'financial_tx_project_fk',
      references: { table: 'projects', field: 'id' },
      onDelete: 'SET NULL',
    });
    await addConstraint(queryInterface, 'financial_transactions', {
      fields: ['createdById'],
      type: 'foreign key',
      name: 'financial_tx_user_fk',
      references: { table: 'users', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 
      'invoices',
      {
        id: PK,
        clientId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        projectId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        invoiceNumber: { type: Sequelize.STRING(64), allowNull: false, unique: true },
        issueDate: { type: Sequelize.DATEONLY, allowNull: false },
        dueDate: { type: Sequelize.DATEONLY, allowNull: true },
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'ETB' },
        taxRate: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
        subtotal: DECIMAL,
        taxAmount: DECIMAL,
        total: DECIMAL,
        paidAmount: DECIMAL,
        status: {
          type: Sequelize.ENUM('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void'),
          allowNull: false,
          defaultValue: 'draft',
        },
        notes: { type: Sequelize.STRING(2000), allowNull: true },
        createdById: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'invoices', ['clientId'], { name: 'invoices_client_idx' });
    await addIndex(queryInterface, 'invoices', ['status'], { name: 'invoices_status_idx' });
    await addIndex(queryInterface, 'invoices', ['dueDate'], { name: 'invoices_due_idx' });
    await addConstraint(queryInterface, 'invoices', {
      fields: ['clientId'],
      type: 'foreign key',
      name: 'invoices_client_fk',
      references: { table: 'clients', field: 'id' },
      onDelete: 'CASCADE',
    });
    await addConstraint(queryInterface, 'invoices', {
      fields: ['projectId'],
      type: 'foreign key',
      name: 'invoices_project_fk',
      references: { table: 'projects', field: 'id' },
      onDelete: 'SET NULL',
    });

    await createTable(queryInterface, 
      'invoice_items',
      {
        id: PK,
        invoiceId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        description: { type: Sequelize.STRING(500), allowNull: false },
        quantity: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
        unitPrice: DECIMAL,
        // Computed in the service layer from quantity × unitPrice, in cents.
        lineTotal: DECIMAL,
        position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        createdAt,
        updatedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'invoice_items', ['invoiceId', 'position'], { name: 'invoice_items_idx' });
    await addConstraint(queryInterface, 'invoice_items', {
      fields: ['invoiceId'],
      type: 'foreign key',
      name: 'invoice_items_invoice_fk',
      references: { table: 'invoices', field: 'id' },
      onDelete: 'CASCADE',
    });

    await createTable(queryInterface, 
      'payments',
      {
        id: PK,
        invoiceId: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        amount: DECIMAL,
        currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'ETB' },
        paymentMethod: {
          type: Sequelize.ENUM('bank_transfer', 'cash', 'cheque', 'mobile_money', 'card', 'other'),
          allowNull: true,
        },
        reference: { type: Sequelize.STRING(191), allowNull: true },
        paidAt: { type: Sequelize.DATEONLY, allowNull: false },
        notes: { type: Sequelize.STRING(1000), allowNull: true },
        createdById: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
        createdAt,
        updatedAt,
        deletedAt,
      },
      { charset: 'utf8mb4', collate: 'utf8mb4_unicode_ci' },
    );
    await addIndex(queryInterface, 'payments', ['invoiceId'], { name: 'payments_invoice_idx' });
    await addIndex(queryInterface, 'payments', ['paidAt'], { name: 'payments_paid_idx' });
    await addConstraint(queryInterface, 'payments', {
      fields: ['invoiceId'],
      type: 'foreign key',
      name: 'payments_invoice_fk',
      references: { table: 'invoices', field: 'id' },
      onDelete: 'CASCADE',
    });
  },

  async down(queryInterface) {
    await dropTableIfExists(queryInterface, 'payments');
    await dropTableIfExists(queryInterface, 'invoice_items');
    await dropTableIfExists(queryInterface, 'invoices');
    await dropTableIfExists(queryInterface, 'financial_transactions');
    await dropTableIfExists(queryInterface, 'financial_categories');
  },
};