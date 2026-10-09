import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design/kombe_tokens.g.dart';

/// Statut par la FORME, toujours doublé d'un libellé :
/// arc ouvert = en attente · anneau fermé + coche = confirmé ·
/// chemin rompu = contesté · pointillé = brouillon local / hors connexion.
enum KombeStatus { draft, pending, confirmed, disputed, offline }

class KombeStatusRing extends StatelessWidget {
  const KombeStatusRing({required this.status, required this.label, super.key, this.size = 18, this.showLabel = true});
  final KombeStatus status;
  final String label;
  final double size;
  final bool showLabel;

  static Color colorOf(KombeStatus s) => switch (s) {
        KombeStatus.confirmed => KombeTokens.success,
        KombeStatus.pending => KombeTokens.warning,
        KombeStatus.disputed => KombeTokens.danger,
        KombeStatus.draft || KombeStatus.offline => KombeTokens.contentSecondary,
      };

  @override
  Widget build(BuildContext context) {
    final Color color = colorOf(status);
    final Widget ring = SizedBox.square(dimension: size, child: CustomPaint(painter: _RingPainter(status, color)));
    if (!showLabel) return Semantics(label: label, child: ring);
    return Semantics(
      label: label,
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            ring,
            const SizedBox(width: 6),
            Text(label, style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

class _RingPainter extends CustomPainter {
  const _RingPainter(this.status, this.color);
  final KombeStatus status;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final double w = size.shortestSide;
    final Offset c = Offset(w / 2, w / 2);
    final double r = w * .375;
    final Rect rect = Rect.fromCircle(center: c, radius: r);
    final Paint p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * .125
      ..strokeCap = StrokeCap.round
      ..color = color;
    switch (status) {
      case KombeStatus.confirmed:
        canvas.drawCircle(c, r, p);
        final Path check = Path()
          ..moveTo(w * .33, w * .52)
          ..lineTo(w * .45, w * .64)
          ..lineTo(w * .68, w * .4);
        canvas.drawPath(check, p..strokeWidth = w * .11);
      case KombeStatus.pending:
        canvas.drawCircle(c, r, Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = w * .125
          ..color = KombeTokens.lineStrong);
        canvas.drawArc(rect, -math.pi / 2, math.pi * 1.4, false, p);
      case KombeStatus.disputed:
        canvas.drawArc(rect, -math.pi / 2, math.pi * .62, false, p);
        canvas.drawArc(rect, math.pi * .3, math.pi * .55, false, p);
        canvas.drawArc(rect, math.pi * 1.05, math.pi * .3, false, p..strokeWidth = w * .07);
      case KombeStatus.draft:
      case KombeStatus.offline:
        const int dashes = 10;
        for (int i = 0; i < dashes; i++) {
          canvas.drawArc(rect, i * 2 * math.pi / dashes, math.pi / dashes * .9, false, p..strokeWidth = w * .1);
        }
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainter o) => o.status != status || o.color != color;
}
