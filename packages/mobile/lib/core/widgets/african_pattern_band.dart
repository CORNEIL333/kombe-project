import 'package:flutter/material.dart';

import '../design/kombe_tokens.g.dart';

/// Trajectoire de pied d'écran : filet ponctué de nœuds (« trajectoire =
/// historique » de la charte). Remplace l'ancien bandeau à triangles, qui
/// n'appartenait à aucune grammaire de marque. Décoratif, exclu des
/// sémantiques. Nom conservé pour la compatibilité des écrans existants.
class AfricanPatternBand extends StatelessWidget {
  const AfricanPatternBand({super.key, this.height = 34});
  final double height;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: SizedBox(
          height: height,
          width: double.infinity,
          child: CustomPaint(painter: const _PathPainter()),
        ),
      );
}

class _PathPainter extends CustomPainter {
  const _PathPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final double y = size.height / 2;
    final Paint line = Paint()
      ..color = KombeTokens.lineStrong
      ..strokeWidth = 1.5;
    canvas.drawLine(Offset(20, y), Offset(size.width - 20, y), line);
    final List<double> stops = <double>[.18, .38, .5, .62, .82];
    for (int i = 0; i < stops.length; i++) {
      final Offset p = Offset(size.width * stops[i], y);
      final bool focal = i == 2;
      canvas.drawCircle(p, focal ? 6 : 4, Paint()..color = focal ? KombeTokens.accent : KombeTokens.surfaceCanvas);
      if (!focal) {
        canvas.drawCircle(
          p,
          4,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 1.5
            ..color = i < 2 ? KombeTokens.brand : KombeTokens.lineStrong,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant _PathPainter oldDelegate) => false;
}
