import 'package:flutter/material.dart';

import '../../core/theme/app_theme.dart';
import '../../core/utils/formatters.dart';

enum StatusTone { neutral, brand, info, warning, success, danger }

class ToneColors {
  const ToneColors(this.foreground, this.background);

  final Color foreground;
  final Color background;

  static ToneColors of(StatusTone tone) {
    switch (tone) {
      case StatusTone.brand:
        return const ToneColors(AppColors.brand, AppColors.brandSoft);
      case StatusTone.info:
        return const ToneColors(AppColors.info, AppColors.infoSoft);
      case StatusTone.warning:
        return const ToneColors(AppColors.warning, AppColors.warningSoft);
      case StatusTone.success:
        return const ToneColors(AppColors.success, AppColors.successSoft);
      case StatusTone.danger:
        return const ToneColors(AppColors.danger, AppColors.dangerSoft);
      case StatusTone.neutral:
        return const ToneColors(AppColors.inkMuted, AppColors.neutralSoft);
    }
  }
}

/// Mirrors the web admin's badge tones so a status reads the same on both.
StatusTone toneForStatus(String? status, {String kind = ''}) {
  final key = (status ?? '').toLowerCase();

  if (kind == 'priority') {
    switch (key) {
      case 'urgent':
        return StatusTone.danger;
      case 'high':
        return StatusTone.warning;
      case 'medium':
        return StatusTone.info;
      case 'low':
        return StatusTone.neutral;
    }
  }

  switch (key) {
    case 'active':
    case 'completed':
    case 'paid':
    case 'converted':
    case 'done':
      return StatusTone.success;
    case 'in_progress':
    case 'issued':
    case 'contacted':
    case 'review':
      return StatusTone.info;
    case 'failed':
    case 'churned':
    case 'exited':
    case 'overdue':
      return StatusTone.danger;
    case 'partially_paid':
    case 'on_hold':
    case 'pending':
    case 'qualified':
    case 'on_leave':
      return StatusTone.warning;
    case 'prospect':
    case 'new':
    case 'todo':
      return StatusTone.brand;
    default:
      return StatusTone.neutral;
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({
    super.key,
    required this.label,
    required this.tone,
    this.icon,
    this.compact = false,
  });

  factory StatusPill.status(
    String? status, {
    String kind = '',
    IconData? icon,
    bool compact = false,
    Key? key,
  }) {
    return StatusPill(
      key: key,
      label: AppFormat.titleCase(status),
      tone: toneForStatus(status, kind: kind),
      icon: icon,
      compact: compact,
    );
  }

  final String label;
  final StatusTone tone;
  final IconData? icon;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final colors = ToneColors.of(tone);
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 7 : 9,
        vertical: compact ? 3 : 5,
      ),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: compact ? 11 : 13, color: colors.foreground),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: colors.foreground,
              fontSize: compact ? 10.5 : 11.5,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.1,
            ),
          ),
        ],
      ),
    );
  }
}

class CountBadge extends StatelessWidget {
  const CountBadge({
    super.key,
    required this.count,
    this.tone = StatusTone.brand,
  });

  final int count;
  final StatusTone tone;

  @override
  Widget build(BuildContext context) {
    final colors = ToneColors.of(tone);
    return Container(
      constraints: const BoxConstraints(minWidth: 22),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: colors.background,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        '$count',
        textAlign: TextAlign.center,
        style: TextStyle(
          color: colors.foreground,
          fontSize: 11,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}
