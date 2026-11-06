import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_ndop.dart';
import '../design/kombe_theme.dart';

/// En-tête d'écran : grand titre Fraunces, sous-titre, coin de motif Ndop.
class KombeScreenHeader extends StatelessWidget {
  const KombeScreenHeader({super.key, required this.title, this.subtitle, this.inset = 20, this.trailing});
  final String title;
  final String? subtitle;
  /// Action discrète à droite du titre (remplace le coin décoratif).
  final Widget? trailing;
  /// Marge gauche du texte (0 quand la liste porte déjà sa marge).
  final double inset;

  @override
  // Hauteur minimale, jamais fixe : le titre grandit avec le texte agrandi.
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 72),
        child: Stack(
          clipBehavior: Clip.hardEdge,
          children: <Widget>[
            if (trailing == null) const Positioned(
              right: -14,
              top: -18,
              width: 112,
              height: 112,
              child: ExcludeSemantics(
                // Coin Ndop (vectoriel) fondu dans le papier.
                child: ShaderMask(
                  blendMode: BlendMode.dstIn,
                  shaderCallback: _fondu,
                  child: CustomPaint(painter: NdopPainter(color: KombeColors.forest, opacity: .12, tile: 30)),
                ),
              ),
            ),
            if (trailing != null) Positioned(right: 8, top: 6, child: trailing!),
            Padding(
              padding: EdgeInsets.fromLTRB(inset, 10, trailing == null ? 116 : 64, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Semantics(
                    header: true,
                    child: Text(title, style: KombeType.display(size: 36)),
                  ),
                  if (subtitle != null) ...<Widget>[
                    const SizedBox(height: 4),
                    Text(subtitle!, style: const TextStyle(color: KombeColors.slate, fontSize: 14)),
                  ],
                ],
              ),
            ),
          ],
        ),
      );
}

Shader _fondu(Rect r) => const RadialGradient(
      center: Alignment.topRight,
      radius: 1.1,
      colors: <Color>[Color(0xFFFFFFFF), Color(0x00FFFFFF)],
      stops: <double>[.35, 1],
    ).createShader(r);
