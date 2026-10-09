import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../domain/entities/group.dart';
import '../design/kombe_colors.dart';
import '../formatters/xaf.dart';

class GroupHeroCard extends StatelessWidget {
  const GroupHeroCard({required this.group, super.key, this.onTap});

  final GroupSummary group;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: group.name,
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            gradient: const LinearGradient(
              colors: <Color>[KombeColors.forestDark, KombeColors.forest],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
          ),
          child: Stack(
            children: <Widget>[
              Positioned.fill(
                child: CustomPaint(painter: _GroupOrbitPainter(total: group.cycleTotal, current: group.cycleIndex)),
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        const Icon(Icons.groups_2_outlined, color: Colors.white),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            group.name,
                            style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                  color: Colors.white,
                                ),
                          ),
                        ),
                        DecoratedBox(
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: .12),
                            borderRadius: BorderRadius.circular(99),
                            border: Border.all(color: Colors.white24),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            child: Text(
                              '${group.cycleIndex}/${group.cycleTotal}',
                              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      '${group.memberCount} membres',
                      style: const TextStyle(color: Colors.white70),
                    ),
                    const SizedBox(height: 24),
                    const Text(
                      'Montant de la cotisation',
                      style: TextStyle(color: Colors.white70),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      Xaf.format(group.contributionAmountXaf),
                      style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                            color: Colors.white,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Orbite du groupe en filigrane (remplace l'ancien motif « montagnes ») :
/// même grammaire que KombeCycleOrbit, tons clairs sur fond forêt.
class _GroupOrbitPainter extends CustomPainter {
  const _GroupOrbitPainter({required this.total, required this.current});
  final int total;
  final int current;

  @override
  void paint(Canvas canvas, Size size) {
    final int n = math.max(1, total);
    final double r = size.height * .62;
    final Offset c = Offset(size.width - r * .55, size.height * .62);
    final Paint ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 5
      ..color = Colors.white.withValues(alpha: .10);
    canvas.drawCircle(c, r, ring);
    if (current > 1) {
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), -math.pi / 2, 2 * math.pi * math.min(1, (current - 1) / n), false,
          ring..color = KombeColors.leaf.withValues(alpha: .55)..strokeCap = StrokeCap.round);
    }
    for (int i = 0; i < n; i++) {
      final double a = -math.pi / 2 + i * 2 * math.pi / n;
      final Offset p = c + Offset(math.cos(a), math.sin(a)) * r;
      final int round = i + 1;
      canvas.drawCircle(
        p,
        round == current ? 7 : 5,
        Paint()
          ..color = round == current
              ? KombeColors.gold
              : round < current
                  ? Colors.white.withValues(alpha: .55)
                  : Colors.white.withValues(alpha: .14),
      );
    }
  }

  @override
  bool shouldRepaint(covariant _GroupOrbitPainter o) => o.total != total || o.current != current;
}
