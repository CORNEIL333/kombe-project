import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_tokens.g.dart';

/// Logotype KÓMBE, direction « L'Orbite » v2 — identique au site, à la PWA et
/// aux tableaux de bord : le Ó du nom est un cercle (le groupe) et son accent
/// aigu devient « l'Accent », le trait or qui désigne partout la personne
/// concernée. Vectoriel (net à toute taille) ; la couleur suit le fond
/// (`inverse` sur fond sombre). `compact` : le symbole seul.
class KombeLogo extends StatelessWidget {
  const KombeLogo({super.key, this.compact = false, this.size = 48, this.inverse = false, this.tagline = false});

  final bool compact;

  /// Hauteur de référence (le mot-symbole fait ≈ la moitié).
  final double size;
  final bool inverse;

  /// Affiche « Votre tontine, plus claire. » sous le nom.
  final bool tagline;

  @override
  Widget build(BuildContext context) {
    final Color ink = inverse ? KombeTokens.sand50 : KombeColors.forest;
    if (compact) {
      return Semantics(label: 'KÓMBE', image: true, child: KombeSymbol(size: size, color: ink));
    }
    final double fs = size * .52;
    final TextStyle letters = TextStyle(
      fontFamily: KombeTokens.fontUi,
      fontSize: fs,
      height: 1,
      fontWeight: FontWeight.w800,
      letterSpacing: fs * .06,
      color: ink,
    );
    final Widget word = Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.center,
      children: <Widget>[
        Text('K', style: letters),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: fs * .04),
          child: Transform.translate(offset: Offset(0, -fs * .04), child: KombeSymbol(size: fs * .98, color: ink)),
        ),
        Text('MBE', style: letters),
      ],
    );
    return Semantics(
      label: tagline ? 'KÓMBE — Votre tontine, plus claire.' : 'KÓMBE',
      header: true,
      excludeSemantics: true,
      child: tagline
          ? Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                word,
                SizedBox(height: fs * .22),
                Text(
                  'Votre tontine, plus claire.',
                  maxLines: 1,
                  style: TextStyle(
                    fontFamily: KombeTokens.fontDisplay,
                    fontStyle: FontStyle.italic,
                    fontSize: (fs * .42).clamp(11, 16),
                    color: inverse ? KombeTokens.gold300 : KombeColors.goldDark,
                  ),
                ),
              ],
            )
          : word,
    );
  }
}

/// Le symbole seul : cercle + l'Accent or (même tracé que SymboleOrbite web).
class KombeSymbol extends StatelessWidget {
  const KombeSymbol({super.key, this.size = 32, this.color = KombeColors.forest});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _SymbolPainter(color)),
      );
}

class _SymbolPainter extends CustomPainter {
  const _SymbolPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final double s = size.shortestSide / 40;
    canvas.scale(s);
    canvas.drawCircle(
      const Offset(20, 22),
      13,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 4.5
        ..color = color,
    );
    canvas.drawLine(
      const Offset(23.5, 3.5),
      const Offset(30, 1),
      Paint()
        ..strokeWidth = 4.5
        ..strokeCap = StrokeCap.round
        ..color = KombeColors.gold,
    );
  }

  @override
  bool shouldRepaint(covariant _SymbolPainter oldDelegate) => oldDelegate.color != color;
}
