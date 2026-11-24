import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/formatters.dart';

/// The identity avatar used across chat surfaces.
///
/// A person's name always hashes to the same gradient pair, so the same face
/// keeps the same colour everywhere in the app. Groups get the ink/graphite
/// treatment with a group glyph instead of initials.
class ChatAvatar extends StatelessWidget {
  const ChatAvatar({
    super.key,
    required this.name,
    this.size = 44,
    this.isGroup = false,
  });

  final String? name;
  final double size;
  final bool isGroup;

  static const _palettes = <List<Color>>[
    [Color(0xFF025298), Color(0xFF4A86D1)],
    [Color(0xFF0F7A4D), Color(0xFF4CBF8B)],
    [Color(0xFF7A3E9D), Color(0xFFB07CD6)],
    [Color(0xFFB87309), Color(0xFFF9A71B)],
    [Color(0xFF1769AA), Color(0xFF62A8E5)],
    [Color(0xFFB42318), Color(0xFFE57373)],
  ];

  @override
  Widget build(BuildContext context) {
    final clean = (name ?? '').trim();
    final hash = clean.codeUnits.fold<int>(0, (sum, unit) => sum + unit);
    final colors = isGroup
        ? const [AppColors.ink, Color(0xFF3D4A5A)]
        : _palettes[hash % _palettes.length];

    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(size * 0.34),
        boxShadow: [
          BoxShadow(
            color: colors.first.withValues(alpha: 0.28),
            blurRadius: size * 0.28,
            offset: Offset(0, size * 0.09),
          ),
        ],
      ),
      child: isGroup
          ? Icon(Icons.groups_rounded, color: Colors.white, size: size * 0.48)
          : Text(
              AppFormat.initials(name),
              style: TextStyle(
                color: Colors.white,
                fontSize: size * 0.36,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.2,
              ),
            ),
    );
  }
}
