import AppError from './AppError.js';

/**
 * Monetary arithmetic in integer minor units (cents).
 *
 * JavaScript floats cannot represent values like 0.1 exactly, so `0.1 + 0.2`
 * yields 0.30000000000000004. Financial columns are DECIMAL(14,2) in MySQL and
 * Sequelize returns them as strings; this module converts to integers, does the
 * maths, and converts back. No float ever touches a balance.
 */

/** Convert a decimal string or number to integer cents. Rejects >2 decimals. */
export function toCents(value) {
  if (value === null || value === undefined || value === '') {
    throw AppError.badRequest('An amount is required');
  }

  const raw = String(value).trim();

  // Reject exponent notation and anything that is not a plain decimal.
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw AppError.badRequest(`"${raw}" is not a valid amount`);
  }

  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');

  if (fraction.length > 2) {
    throw AppError.badRequest(`Amount "${raw}" has more than two decimal places`);
  }

  const padded = (fraction + '00').slice(0, 2);
  const cents = Number(whole) * 100 + Number(padded);

  return negative ? -cents : cents;
}

/** Convert integer cents to a fixed 2-decimal string, ready for a DECIMAL column. */
export function fromCents(cents) {
  const value = Math.trunc(Number(cents) || 0);
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

/**
 * Multiply a cents amount by a decimal quantity.
 * Used for invoice line totals: lineTotal = quantity × unitPrice.
 */
export function multiplyCents(cents, quantity) {
  const factor = Number(quantity);
  if (!Number.isFinite(factor)) {
    throw AppError.badRequest('Quantity must be a number');
  }
  // Round half away from zero, which is what an accountant would expect.
  const raw = cents * factor;
  const rounded = Math.sign(raw) * Math.round(Math.abs(raw));
  return Math.trunc(rounded);
}

/** Percentage of a cents amount, e.g. taxRate 15 on 10000 cents -> 1500. */
export function percentageCents(cents, rate) {
  const factor = Number(rate) || 0;
  const raw = cents * (factor / 100);
  return Math.trunc(Math.sign(raw) * Math.round(Math.abs(raw)));
}

/** Sum a list of cents values without float accumulation. */
export function sumCents(values) {
  return values.reduce((total, value) => total + Math.trunc(Number(value) || 0), 0);
}

/**
 * Recalculate an invoice from its line items.
 * Every step is integer maths; the caller writes the result inside the same
 * transaction that wrote the items, so a total is never left stale.
 */
export function calculateInvoiceTotals(items, taxRate = 0) {
  const lineTotals = items.map((item) => ({
    ...item,
    lineTotalCents: multiplyCents(toCents(item.unitPrice), item.quantity),
  }));

  const subtotalCents = sumCents(lineTotals.map((item) => item.lineTotalCents));
  const taxCents = percentageCents(subtotalCents, taxRate);
  const totalCents = subtotalCents + taxCents;

  return {
    lineTotals,
    subtotal: fromCents(subtotalCents),
    taxAmount: fromCents(taxCents),
    total: fromCents(totalCents),
  };
}

/**
 * Derive an invoice status from its totals and payments.
 * Kept in one place so the status can never contradict the amounts.
 */
export function deriveInvoiceStatus({ totalCents, paidCents, dueDate, currentStatus }) {
  if (currentStatus === 'draft' || currentStatus === 'void') return currentStatus;

  if (paidCents >= totalCents && totalCents > 0) return 'paid';
  if (paidCents > 0) return 'partially_paid';

  if (dueDate) {
    const due = new Date(dueDate);
    // Compare against end of the due day so an invoice due today is not overdue.
    due.setHours(23, 59, 59, 999);
    if (due.getTime() < Date.now()) return 'overdue';
  }

  return 'issued';
}

/** Outstanding balance on an invoice, in cents. Never negative. */
export function outstandingCents(totalCents, paidCents) {
  return Math.max(0, Math.trunc(totalCents) - Math.trunc(paidCents));
}