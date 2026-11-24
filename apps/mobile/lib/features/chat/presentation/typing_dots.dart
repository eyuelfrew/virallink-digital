import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Three dots that rise and fall out of phase — the "someone is typing"
/// signal, used in the thread and next to the header subtitle.
class TypingDots extends StatefulWidget {
  const TypingDots({
    super.key,
    this.color = const Color(0xFF5B6673),
    this.size = 6,
    this.gap = 3.5,
  });

  final Color color;
  final double size;
  final double gap;

  @override
  State<TypingDots> createState() => _TypingDotsState();
}

class _TypingDotsState extends State<TypingDots>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(3, (index) {
            final phase = (_controller.value * 2 * math.pi) - (index * 0.9);
            final lift = (math.sin(phase) + 1) / 2;
            return Padding(
              padding: EdgeInsets.only(right: index == 2 ? 0 : widget.gap),
              child: Transform.translate(
                offset: Offset(0, -2.6 * lift),
                child: Container(
                  width: widget.size,
                  height: widget.size,
                  decoration: BoxDecoration(
                    color: widget.color.withValues(alpha: 0.5 + 0.5 * lift),
                    shape: BoxShape.circle,
                  ),
                ),
              ),
            );
          }),
        );
      },
    );
  }
}
