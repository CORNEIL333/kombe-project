import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'kombe_colors.dart';

/// Motif « Ndop » de la marque : lignes géométriques inspirées du tissu
/// bamiléké (réserve blanche sur indigo), dessinées en vecteur — net à toute
/// taille, sans image, recolorable. Trois variantes :
/// 0 losanges pointés, 1 chevrons, 2 anneaux à quatre nœuds (écho du logo).
class NdopPainter extends CustomPainter {
  const NdopPainter({this.color = KombeColors.cream, this.opacity = .14, this.variant = 2, this.tile = 28});

  final Color color;
  final double opacity;
  final int variant;
  final double tile;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint p = Paint()
      ..color = color.withValues(alpha: opacity)
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1, tile / 22)
      ..strokeCap = StrokeCap.round;
    final Paint dot = Paint()..color = color.withValues(alpha: opacity * 1.3);
    final double t = tile;
    final int cols = (size.width / t).ceil() + 1;
    final int rows = (size.height / t).ceil() + 1;
    switch (variant % 3) {
      case 0:
        // Treillis de losanges, un point au cœur de chacun.
        for (int i = -rows; i < cols + rows; i++) {
          canvas.drawLine(Offset(i * t, 0), Offset(i * t + rows * t, rows * t), p);
          canvas.drawLine(Offset(i * t, 0), Offset(i * t - rows * t, rows * t), p);
        }
        for (int y = 0; y < rows; y++) {
          for (int x = 0; x < cols; x++) {
            canvas.drawCircle(Offset(x * t + t / 2, y * t), t * .07, dot);
          }
        }
      case 1:
        // Rangées de chevrons séparées par un filet de tirets.
        for (int y = 0; y < rows; y++) {
          final Path z = Path()..moveTo(-t, y * t + t * .3);
          for (int x = -1; x <= cols; x++) {
            z
              ..lineTo(x * t + t / 2, y * t + t * .7)
              ..lineTo(x * t + t, y * t + t * .3);
          }
          canvas.drawPath(z, p);
          for (int x = 0; x < cols; x++) {
            canvas.drawLine(Offset(x * t + t * .3, y * t + t * .95), Offset(x * t + t * .7, y * t + t * .95), p);
          }
        }
      case 2:
        // Anneaux à quatre nœuds, en quinconce.
        for (int y = 0; y < rows; y++) {
          for (int x = 0; x < cols; x++) {
            final Offset c = Offset(x * t + (y.isOdd ? t / 2 : 0), y * t);
            canvas.drawCircle(c, t * .3, p);
            for (int k = 0; k < 4; k++) {
              final double a = k * math.pi / 2 + math.pi / 4;
              canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * t * .3, t * .06, dot);
            }
          }
        }
    }
  }

  @override
  bool shouldRepaint(covariant NdopPainter old) =>
      old.color != color || old.opacity != opacity || old.variant != variant || old.tile != tile;
}
