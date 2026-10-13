import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';

class KombeLogo extends StatelessWidget {
  const KombeLogo({super.key, this.compact = false, this.size = 48});

  final bool compact;
  final double size;

  @override
  Widget build(BuildContext context) {
    final Widget emblem = SizedBox.square(
      dimension: size,
      child: CustomPaint(painter: const _KombeEmblemPainter()),
    );
    if (compact) return Semantics(label: 'KÓMBE', image: true, child: emblem);
    return Semantics(
      label: 'KÓMBE — Votre tontine, plus claire.',
      header: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          emblem,
          const SizedBox(width: 10),
          // Flexible : sur un écran étroit, la signature passe à la ligne au
          // lieu de déborder.
          Flexible(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                'KÓMBE',
                maxLines: 1,
                overflow: TextOverflow.fade,
                softWrap: false,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: KombeColors.forest,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1,
                    ),
              ),
              Text(
                'Votre tontine, plus claire.',
                softWrap: true,
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: KombeColors.forest,
                    ),
              ),
            ],
          )),
        ],
      ),
    );
  }
}

class _KombeEmblemPainter extends CustomPainter {
  const _KombeEmblemPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.shortestSide / 2;
    final Paint gold = Paint()
      ..color = KombeColors.gold
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(2, r * .11);
    final Paint green = Paint()..color = KombeColors.forest;
    final Paint leaf = Paint()..color = KombeColors.leaf;
    final Paint goldFill = Paint()..color = KombeColors.gold;

    canvas.drawCircle(c, r * .82, gold);

    final double headR = r * .13;
    final List<Offset> heads = <Offset>[
      Offset(c.dx, c.dy - r * .34),
      Offset(c.dx - r * .28, c.dy - r * .12),
      Offset(c.dx + r * .28, c.dy - r * .12),
      Offset(c.dx - r * .13, c.dy + r * .08),
      Offset(c.dx + r * .13, c.dy + r * .08),
    ];
    for (int i = 0; i < heads.length; i++) {
      canvas.drawCircle(heads[i], headR, i == 0 ? goldFill : green);
    }

    final Path left = Path()
      ..moveTo(c.dx - r * .48, c.dy + r * .08)
      ..quadraticBezierTo(c.dx - r * .38, c.dy + r * .55, c.dx, c.dy + r * .66)
      ..quadraticBezierTo(c.dx - r * .10, c.dy + r * .26, c.dx - r * .48, c.dy + r * .08)
      ..close();
    final Path right = Path()
      ..moveTo(c.dx + r * .48, c.dy + r * .08)
      ..quadraticBezierTo(c.dx + r * .38, c.dy + r * .55, c.dx, c.dy + r * .66)
      ..quadraticBezierTo(c.dx + r * .10, c.dy + r * .26, c.dx + r * .48, c.dy + r * .08)
      ..close();
    canvas.drawPath(left, leaf);
    canvas.drawPath(right, green);
  }

  @override
  bool shouldRepaint(covariant _KombeEmblemPainter oldDelegate) => false;
}
