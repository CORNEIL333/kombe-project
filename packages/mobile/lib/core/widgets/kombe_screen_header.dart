import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';

/// En-tête d'écran (planche) : grand titre, sous-titre, motif tissé en coin.
class KombeScreenHeader extends StatelessWidget {
  const KombeScreenHeader({super.key, required this.title, required this.subtitle, this.inset = 20});
  final String title;
  final String subtitle;
  /// Marge gauche du texte (0 quand la liste porte déjà sa marge).
  final double inset;

  @override
  // Hauteur minimale, jamais fixe : le titre grandit avec le texte agrandi.
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: const BoxConstraints(minHeight: 96),
        child: Stack(
          clipBehavior: Clip.hardEdge,
          children: <Widget>[
            const Positioned(
              right: -30,
              top: -30,
              child: ExcludeSemantics(
                // Coin tissé fondu dans le fond (pas de bord franc).
                child: ShaderMask(
                  blendMode: BlendMode.dstIn,
                  shaderCallback: _fondu,
                  child: Image(image: AssetImage('assets/images/fonds/creation.webp'), width: 170, fit: BoxFit.cover),
                ),
              ),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(inset, 10, 120, 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Semantics(
                    header: true,
                    child: Text(title, style: const TextStyle(color: KombeColors.forest, fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -.6)),
                  ),
                  const SizedBox(height: 4),
                  Text(subtitle, style: const TextStyle(color: KombeColors.slate, fontSize: 14)),
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
