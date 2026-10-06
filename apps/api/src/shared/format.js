/**
 * Formatting helpers. Money is handled in integer minor units (cents) end to end
 * so no float arithmetic ever touches a balance. `cents` is an integer; the DB
 * DECIMAL column is converted at the service boundary.
 */

export function toCents(value) {
  const raw = String(value ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new TypeError(`Cannot convert "${raw}" to cents`);
  }
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [whole, fraction = ''] = unsigned.split('.');
  const padded = (fraction + '00').slice(0, 2);
  const fracTail = fraction.slice(2);
  let cents = Number(whole) * 100 + Number(padded);
  if (fracTail) throw new TypeError(`Amount "${raw}" has more than 2 decimal places`);
  return negative ? -cents : cents;
}

export function fromCents(cents) {
  const value = Math.trunc(Number(cents) || 0);
  const negative = value < 0;
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / 100);
  const fraction = absolute % 100;
  return `${negative ? '-' : ''}${whole}.${String(fraction).padStart(2, '0')}`;
}

export function formatMoney(centsOrDecimal, { currency = 'ETB', locale = 'en-ET' } = {}) {
  let cents;
  if (typeof centsOrDecimal === 'number' && Number.isInteger(centsOrDecimal)) {
    cents = centsOrDecimal;
  } else {
    try {
      cents = toCents(centsOrDecimal);
    } catch {
      return '—';
    }
  }
  try {
    const value = cents / 100;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${fromCents(cents)} ${currency}`;
  }
}

export function formatMoneyCompact(cents, { currency = 'ETB', locale = 'en-ET' } = {}) {
  try {
    const value = cents / 100;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    return `${fromCents(cents)} ${currency}`;
  }
}

export function formatPercent(numerator, denominator, digits = 1) {
  const n = Number(numerator) || 0;
  const d = Number(denominator) || 0;
  if (d === 0) return '0%';
  return `${((n / d) * 100).toFixed(digits)}%`;
}

export function formatDate(value, { locale = 'en-GB', withTime = false } = {}) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function formatRelative(value, { locale = 'en-GB' } = {}) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, secondsPerUnit] of units) {
    if (Math.abs(seconds) >= secondsPerUnit) {
      return formatter.format(Math.round(seconds / secondsPerUnit), unit);
    }
  }
  return formatter.format(seconds, 'second');
}

export function formatNumber(value, { locale = 'en-ET' } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat(locale).format(n);
}

export function maskEmail(email) {
  const raw = String(email || '');
  const at = raw.indexOf('@');
  if (at <= 0) return '—';
  const local = raw.slice(0, at);
  const domain = raw.slice(at);
  if (local.length <= 2) return `${local[0] || '*'}***${domain}`;
  return `${local.slice(0, 1)}${'*'.repeat(Math.min(local.length - 1, 6))}${domain}`;
}

export function formatAddress(parts = []) {
  return parts.filter((p) => p && String(p).trim()).join(', ');
}
