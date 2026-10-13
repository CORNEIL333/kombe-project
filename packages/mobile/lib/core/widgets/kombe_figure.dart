import 'dart:ui';

/// Silhouette KÓMBE : la version humaine du nœud de l'orbite (tête + épaules).
/// Réservée aux couches marque et onboarding (illustration) ; le produit
/// garde des nœuds simples pour la lisibilité. Même géométrie que
/// `apps/site/src/orbit.ts` (option `figures`).
void paintKombeFigure(
  Canvas canvas,
  Offset center,
  double r, {
  required Color fill,
  Color? outline,
  double outlineWidth = 2,
  bool armUp = false,
}) {
  final Path body = Path()
    ..moveTo(center.dx - r, center.dy + r * .9)
    ..quadraticBezierTo(center.dx - r, center.dy - r * .05, center.dx, center.dy - r * .05)
    ..quadraticBezierTo(center.dx + r, center.dy - r * .05, center.dx + r, center.dy + r * .9)
    ..close();
  final Offset head = center + Offset(0, -r * .62);
  if (armUp) {
    canvas.drawLine(
      center + Offset(r * .55, r * .1),
      center + Offset(r * .95, -r * 1.05),
      Paint()
        ..color = outline ?? fill
        ..strokeWidth = r * .32
        ..strokeCap = StrokeCap.round,
    );
  }
  canvas.drawPath(body, Paint()..color = fill);
  canvas.drawCircle(head, r * .44, Paint()..color = fill);
  if (outline != null) {
    final Paint o = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = outlineWidth
      ..color = outline;
    canvas.drawPath(body, o);
    canvas.drawCircle(head, r * .44, o);
  }
}
