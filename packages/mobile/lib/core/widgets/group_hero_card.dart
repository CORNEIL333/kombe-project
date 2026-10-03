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
                child: CustomPaint(painter: const _MountainPatternPainter()),
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

class _MountainPatternPainter extends CustomPainter {
  const _MountainPatternPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final Paint p1 = Paint()..color = KombeColors.gold.withValues(alpha: .12);
    final Paint p2 = Paint()..color = Colors.black.withValues(alpha: .08);
    final Path mountain = Path()
      ..moveTo(size.width * .38, size.height)
      ..lineTo(size.width * .72, size.height * .35)
      ..lineTo(size.width, size.height * .64)
      ..lineTo(size.width, size.height)
      ..close();
    canvas.drawPath(mountain, p1);
    final Path base = Path()
      ..moveTo(0, size.height * .78)
      ..quadraticBezierTo(size.width * .55, size.height * .62, size.width, size.height * .8)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(base, p2);
  }

  @override
  bool shouldRepaint(covariant _MountainPatternPainter oldDelegate) => false;
}
