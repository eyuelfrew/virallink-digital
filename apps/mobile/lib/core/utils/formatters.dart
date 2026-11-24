import 'package:intl/intl.dart';

import 'json.dart';

/// Display formatting shared by every screen.
///
/// Money rules mirror `apps/web/shared/format.js`:
/// - aggregates from the API are integer minor units (`*Cents`)
/// - raw database columns arrive as decimal strings
/// - currency defaults to ETB
class AppFormat {
  AppFormat._();

  static final NumberFormat _number = NumberFormat.decimalPattern('en_ET');
  static final DateFormat _date = DateFormat('d MMM yyyy');
  static final DateFormat _dateTime = DateFormat('d MMM yyyy · HH:mm');
  static final DateFormat _shortDate = DateFormat('d MMM');
  static final DateFormat _time = DateFormat('HH:mm');

  static String money(dynamic decimalValue, {String currency = 'ETB'}) {
    final amount = doubleOrNull(decimalValue);
    if (amount == null) return '—';
    return _currency(currency).format(amount);
  }

  static String cents(num? cents, {String currency = 'ETB'}) {
    if (cents == null) return '—';
    return _currency(currency).format(cents / 100);
  }

  static NumberFormat _currency(String currency) {
    final symbol = currency.toUpperCase() == 'ETB' ? 'ETB ' : '$currency ';
    return NumberFormat.currency(
      locale: 'en_ET',
      symbol: symbol,
      decimalDigits: 2,
    );
  }

  static String number(dynamic value) {
    final parsed = doubleOrNull(value);
    return parsed == null ? '—' : _number.format(parsed);
  }

  static String percent(num? value, {int digits = 0}) {
    if (value == null) return '—';
    return '${value.toStringAsFixed(digits)}%';
  }

  static String date(dynamic value) {
    final parsed = dateOrNull(value);
    return parsed == null ? '—' : _date.format(parsed.toLocal());
  }

  static String timeOfDay(dynamic value) {
    final parsed = dateOrNull(value);
    return parsed == null ? '' : _time.format(parsed.toLocal());
  }

  static String shortDate(dynamic value) {
    final parsed = dateOrNull(value);
    return parsed == null ? '—' : _shortDate.format(parsed.toLocal());
  }

  static String dateTime(dynamic value) {
    final parsed = dateOrNull(value);
    return parsed == null ? '—' : _dateTime.format(parsed.toLocal());
  }

  static String relative(dynamic value) {
    final parsed = dateOrNull(value);
    if (parsed == null) return '—';

    final now = DateTime.now();
    final diff = now.difference(parsed.toLocal());

    if (diff.isNegative) {
      final ahead = parsed.toLocal().difference(now);
      if (ahead.inMinutes < 60) return 'in ${ahead.inMinutes}m';
      if (ahead.inHours < 24) return 'in ${ahead.inHours}h';
      if (ahead.inDays < 7) return 'in ${ahead.inDays}d';
      return date(parsed);
    }

    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return date(parsed);
  }

  static bool isOverdue(dynamic dueDate) {
    final parsed = dateOrNull(dueDate);
    if (parsed == null) return false;
    final now = DateTime.now();
    final endOfDueDay = DateTime(
      parsed.year,
      parsed.month,
      parsed.day,
      23,
      59,
      59,
    );
    return endOfDueDay.isBefore(now);
  }

  static String initials(String? name) {
    final clean = (name ?? '').trim();
    if (clean.isEmpty) return '?';
    final parts = clean.split(RegExp(r'\s+'));
    if (parts.length == 1) {
      return parts.first.substring(0, 1).toUpperCase();
    }
    return '${parts.first.substring(0, 1)}${parts.last.substring(0, 1)}'
        .toUpperCase();
  }

  static String titleCase(String? value) {
    final clean = (value ?? '').trim();
    if (clean.isEmpty) return '—';
    return clean
        .split(RegExp(r'[_\s]+'))
        .where((part) => part.isNotEmpty)
        .map(
          (part) =>
              '${part[0].toUpperCase()}${part.substring(1).toLowerCase()}',
        )
        .join(' ');
  }
}
