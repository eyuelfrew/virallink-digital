/**
 * Money arithmetic tests.
 *
 * These are the calculations that must never be wrong: a balance that is off by
 * a cent compounds across every invoice and payment. All arithmetic runs in
 * integer cents precisely because these cases fail with floats.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  toCents,
  fromCents,
  multiplyCents,
  percentageCents,
  sumCents,
  calculateInvoiceTotals,
  deriveInvoiceStatus,
  outstandingCents,
} from '../src/utils/money.js';

test('toCents converts decimals without float error', () => {
  assert.equal(toCents('0.1'), 10);
  assert.equal(toCents('1234.56'), 123456);
  assert.equal(toCents('0.01'), 1);
  assert.equal(toCents('100'), 10000);
  assert.equal(toCents('-25.50'), -2550);
  assert.equal(toCents(99.99), 9999);
});

test('toCents rejects more than two decimal places', () => {
  assert.throws(() => toCents('1.005'), /two decimal places/);
});

test('toCents rejects non-numeric input', () => {
  assert.throws(() => toCents('abc'), /not a valid amount/);
  // Exponent notation would otherwise slip through as a valid number.
  assert.throws(() => toCents('1e5'), /not a valid amount/);
  assert.throws(() => toCents(''), /amount is required/);
  assert.throws(() => toCents(null), /amount is required/);
});

test('fromCents always produces two decimals', () => {
  assert.equal(fromCents(123456), '1234.56');
  assert.equal(fromCents(5), '0.05');
  assert.equal(fromCents(0), '0.00');
  assert.equal(fromCents(-2550), '-25.50');
});

test('toCents and fromCents round-trip', () => {
  for (const value of ['0.01', '9.99', '1234.56', '999999.99']) {
    assert.equal(fromCents(toCents(value)), value);
  }
});

test('the classic float failure case is exact here', () => {
  // 0.1 + 0.2 === 0.30000000000000004 in floating point.
  assert.equal(sumCents([toCents('0.1'), toCents('0.2')]), 30);
  assert.equal(fromCents(sumCents([toCents('0.1'), toCents('0.2')])), '0.30');
});

test('multiplyCents handles fractional quantities', () => {
  assert.equal(multiplyCents(10000, 3), 30000);
  assert.equal(multiplyCents(10000, 0.5), 5000);
  assert.equal(multiplyCents(3333, 3), 9999);
  // 33.33 * 3 = 99.99, exact.
  assert.equal(multiplyCents(3333, 3) / 100, 99.99);
});

test('multiplyCents rounds half away from zero', () => {
  // 5 cents * 1.5 = 7.5 cents exactly, which rounds up to 8.
  assert.equal(multiplyCents(5, 1.5), 8);
  // The negative counterpart rounds away from zero, not toward it.
  assert.equal(multiplyCents(-5, 1.5), -8);
  assert.equal(multiplyCents(-1050, 1.5), -1575);
});

test('percentageCents computes tax exactly', () => {
  assert.equal(percentageCents(10000, 15), 1500);
  assert.equal(percentageCents(99999, 15), 15000);
  assert.equal(percentageCents(10000, 0), 0);
  assert.equal(percentageCents(10000, 100), 10000);
});

test('sumCents adds without drift', () => {
  const amounts = ['0.10', '0.20', '0.30', '1234.56', '0.01'];
  const total = sumCents(amounts.map(toCents));
  assert.equal(fromCents(total), '1235.17');
});

test('calculateInvoiceTotals builds a correct invoice', () => {
  const result = calculateInvoiceTotals(
    [
      { description: 'Design', quantity: 1, unitPrice: '2500.00' },
      { description: 'Development', quantity: 40, unitPrice: '75.00' },
    ],
    15,
  );

  assert.equal(result.subtotal, '5500.00');
  assert.equal(result.taxAmount, '825.00');
  assert.equal(result.total, '6325.00');
  assert.equal(result.lineTotals[1].lineTotalCents, 300000);
});

test('calculateInvoiceTotals with zero tax', () => {
  const result = calculateInvoiceTotals([{ description: 'Work', quantity: 2, unitPrice: '100.00' }], 0);
  assert.equal(result.subtotal, '200.00');
  assert.equal(result.taxAmount, '0.00');
  assert.equal(result.total, '200.00');
});

test('deriveInvoiceStatus reflects payments', () => {
  const future = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  assert.equal(deriveInvoiceStatus({ totalCents: 10000, paidCents: 0, dueDate: future, currentStatus: 'issued' }), 'issued');
  assert.equal(deriveInvoiceStatus({ totalCents: 10000, paidCents: 5000, dueDate: future, currentStatus: 'issued' }), 'partially_paid');
  assert.equal(deriveInvoiceStatus({ totalCents: 10000, paidCents: 10000, dueDate: future, currentStatus: 'issued' }), 'paid');
  assert.equal(deriveInvoiceStatus({ totalCents: 10000, paidCents: 0, dueDate: past, currentStatus: 'issued' }), 'overdue');
});

test('deriveInvoiceStatus never downgrades draft or void', () => {
  const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(deriveInvoiceStatus({ totalCents: 10000, paidCents: 0, dueDate: past, currentStatus: 'draft' }), 'draft');
  assert.equal(deriveInvoiceStatus({ totalCents: 10000, paidCents: 10000, dueDate: past, currentStatus: 'void' }), 'void');
});

test('an invoice due today is not overdue', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(deriveInvoiceStatus({ totalCents: 10000, paidCents: 0, dueDate: today, currentStatus: 'issued' }), 'issued');
});

test('outstandingCents never goes negative', () => {
  assert.equal(outstandingCents(10000, 4000), 6000);
  assert.equal(outstandingCents(10000, 10000), 0);
  // An overpayment is clamped rather than reported as a negative balance.
  assert.equal(outstandingCents(10000, 15000), 0);
});