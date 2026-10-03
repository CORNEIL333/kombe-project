import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';

class AfricanPatternBand extends StatelessWidget {
  const AfricanPatternBand({super.key, this.height = 34});
  final double height;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: height,
      width: double.infinity,
      child: CustomPaint(painter: const _PatternPainter()),
    );
  }
}

class _PatternPainter extends CustomPainter {
  const _PatternPainter();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = KombeColors.cream);
    final double u = size.height;
    for (double x = -u; x < size.width + u; x += u * 1.5) {
      final Path p = Path()
        ..moveTo(x, size.height)
        ..lineTo(x + u * .5, 0)
        ..lineTo(x + u, size.height)
        ..close();
      canvas.drawPath(p, Paint()..color = KombeColors.forest);
      final Path q = Path()
        ..moveTo(x + u * .28, size.height)
        ..lineTo(x + u * .5, size.height * .35)
        ..lineTo(x + u * .72, size.height)
        ..close();
      canvas.drawPath(q, Paint()..color = KombeColors.gold);
    }
  }

  @override
  bool shouldRepaint(covariant _PatternPainter oldDelegate) => false;
}
