import 'package:flutter/material.dart';

import '../design/kombe_tokens.g.dart';

/// Signe KÓMBE : anneau à quatre nœuds (charte 01/08), dessiné en vectoriel
/// pour rester net à toute taille et pouvoir être animé (`progress` 0→1 :
/// les nœuds rejoignent l'anneau puis l'anneau se ferme).
class KombeMark extends StatelessWidget {
  const KombeMark({super.key, this.size = 40, this.inverse = false, this.progress = 1});
  final double size;
  final bool inverse;
  final double progress;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: KombeMarkPainter(inverse: inverse, progress: progress)),
      );
}

class KombeMarkPainter extends CustomPainter {
  const KombeMarkPainter({this.inverse = false, this.progress = 1});
  final bool inverse;
  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final double s = size.shortestSide / 100;
    canvas.scale(s);
    const Offset c = Offset(50, 50);
    final double ring = Curves.easeOutCubic.transform(((progress - .35) / .65).clamp(0, 1));
    final double nodes = Curves.easeOutCubic.transform((progress / .55).clamp(0, 1));
    final Rect r = Rect.fromCircle(center: c, radius: 34);
    final Paint stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12;
    const double q = 3.14159265 / 2;
    // anneau : forêt (ou vert vivant en inverse), puis quart or, quart vert actif
    canvas.drawArc(r, -q * 2, q * 4 * ring, false, stroke..color = inverse ? KombeTokens.brandLiving : KombeTokens.brand);
    canvas.drawArc(r, -q * 2, q * ring.clamp(0, 1), false, stroke..color = KombeTokens.accent);
    if (!inverse) canvas.drawArc(r, -q, q * ring, false, stroke..color = KombeTokens.brandAction);
    final Paint gap = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..color = inverse ? KombeTokens.brand : KombeTokens.surfaceCanvas;
    final List<(Offset, Color)> pts = <(Offset, Color)>[
      (const Offset(50, 16), KombeTokens.sand100),
      (const Offset(16, 50), KombeTokens.accent),
      (const Offset(84, 50), inverse ? KombeTokens.surfaceCanvas : KombeTokens.brandAction),
      (const Offset(50, 84), KombeTokens.sand100),
    ];
    for (final (Offset p, Color col) in pts) {
      // nœuds : partent du centre (dispersion → convergence)
      final Offset at = Offset.lerp(c + (p - c) * 1.6, p, nodes)!;
      final double rr = 12 * nodes;
      if (rr <= 0) continue;
      canvas.drawCircle(at, rr, Paint()..color = col);
      canvas.drawCircle(at, rr, gap);
    }
  }

  @override
  bool shouldRepaint(covariant KombeMarkPainter old) => old.progress != progress || old.inverse != inverse;
}
