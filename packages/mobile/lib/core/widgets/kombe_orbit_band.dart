import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';

/// Frise de marque (direction « L'Orbite ») : un grand arc d'orbite qui
/// traverse le bas de l'écran, des nœuds-membres posés dessus et un seul nœud
/// or avec l'Accent. Purement décoratif (aucune donnée), exclu de la
/// sémantique ; remplace l'ancienne frise de triangles.
class KombeOrbitBand extends StatelessWidget {
  const KombeOrbitBand({super.key, this.height = 34});
  final double height;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: SizedBox(
          height: height,
          width: double.infinity,
          child: const CustomPaint(painter: _OrbitBandPainter()),
        ),
      );
}

class _OrbitBandPainter extends CustomPainter {
  const _OrbitBandPainter();

  @override
  void paint(Canvas canvas, Size size) {
    // Cercle très large dont seul le sommet est visible : l'arc de l'orbite.
    final double r = size.width * 1.4;
    final Offset c = Offset(size.width / 2, r + size.height * .38);
    final Paint ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.6
      ..color = KombeColors.forest.withValues(alpha: .28);
    canvas.drawCircle(c, r, ring);
    final Paint arc = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..color = KombeColors.emerald;
    final double span = size.width / r; // angle couvrant la largeur
    final double start = -math.pi / 2 - span / 2;
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), start, span * .46, false, arc);

    const int n = 9;
    const int current = 4; // position décorative fixe (ne représente aucun tour réel)
    for (int i = 0; i < n; i++) {
      final double a = start + span * (i + .5) / n;
      final Offset p = c + Offset(math.cos(a), math.sin(a)) * r;
      final bool done = i < current;
      final bool now = i == current;
      final double nr = now ? 6.5 : 4.5;
      canvas.drawCircle(p, nr, Paint()..color = now ? KombeColors.gold : done ? KombeColors.emerald : KombeColors.cream);
      if (!done && !now) {
        canvas.drawCircle(
          p,
          nr,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.6
            ..color = KombeColors.forest.withValues(alpha: .45),
        );
      }
      if (now) {
        // L'Accent : trait or tangent, juste sous le nœud courant.
        final Offset out = Offset(math.cos(a), math.sin(a));
        final Offset tan = Offset(-out.dy, out.dx);
        final Offset m = p - out * 12;
        canvas.drawLine(
          m - tan * 6,
          m + tan * 6,
          Paint()
            ..strokeWidth = 3
            ..strokeCap = StrokeCap.round
            ..color = KombeColors.gold,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _OrbitBandPainter oldDelegate) => false;
}
