import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_tokens.g.dart';

/// Logo KÓMBE conforme à la CHARTE VISUELLE (01/08) — identique au site et à
/// la PWA (même géométrie : packages/brand/marks/kombe-logo.json) :
/// l'anneau de confiance (4 arcs : or chaud, vert actif ×2, vert forêt) et
/// ses 4 nœuds-membres (sable, or, verts) détachés par un liseré, le nom
/// « KÓMBE » et la signature « Votre tontine, plus claire. ».
enum KombeLogoVariante { couleur, inverse, mono }

class _Palette {
  const _Palette(this.arcs, this.noeuds, this.fond, this.texte, this.signature);
  final List<Color> arcs; // haut-gauche, haut-droit, bas-droit, bas-gauche
  final List<Color> noeuds; // haut, gauche, droite, bas
  final Color fond;
  final Color texte;
  final Color signature;

  static const _Palette couleur = _Palette(
    <Color>[Color(0xFFC7922E), Color(0xFF176B52), Color(0xFF176B52), Color(0xFF103C32)],
    <Color>[Color(0xFFEFE3CC), Color(0xFFD4A544), Color(0xFF176B52), Color(0xFF176B52)],
    Color(0xFFFBF8F1),
    Color(0xFF103C32),
    Color(0xFF176B52),
  );
  static const _Palette inverse = _Palette(
    <Color>[Color(0xFFC7922E), Color(0xFF2A8A68), Color(0xFFEFE3CC), Color(0xFFEFE3CC)],
    <Color>[Color(0xFFFBF8F1), Color(0xFFD4A544), Color(0xFF2A8A68), Color(0xFFFBF8F1)],
    Color(0xFF103C32),
    Color(0xFFFBF8F1),
    Color(0xFFEFE3CC),
  );
  static const _Palette mono = _Palette(
    <Color>[Color(0xFF13211C), Color(0xFF13211C), Color(0xFF13211C), Color(0xFF13211C)],
    <Color>[Color(0xFF13211C), Color(0xFF13211C), Color(0xFF13211C), Color(0xFF13211C)],
    Color(0xFFFFFFFF),
    Color(0xFF13211C),
    Color(0xFF13211C),
  );
  static _Palette de(KombeLogoVariante v) => switch (v) {
        KombeLogoVariante.couleur => couleur,
        KombeLogoVariante.inverse => inverse,
        KombeLogoVariante.mono => mono,
      };
}

/// Symbole seul. [progression] 0→1 anime l'ouverture : les nœuds arrivent
/// (ressort), puis les arcs se tracent ; 1 = état final.
class KombeSymbol extends StatelessWidget {
  const KombeSymbol({super.key, this.size = 40, this.variante = KombeLogoVariante.couleur, this.progression = 1, this.fond});
  final double size;
  final KombeLogoVariante variante;
  final double progression;

  /// Couleur du liseré des nœuds (par défaut : fond de la variante).
  final Color? fond;

  @override
  Widget build(BuildContext context) => SizedBox.square(
        dimension: size,
        child: CustomPaint(painter: _SymbolePainter(_Palette.de(variante), progression, fond)),
      );
}

class _SymbolePainter extends CustomPainter {
  const _SymbolePainter(this.p, this.t, this.fond);
  final _Palette p;
  final double t;
  final Color? fond;

  // Géométrie partagée (repère 100 × 100, cadre 2..98).
  static const double _r = 34, _trait = 15.5, _noeud = 11.2, _halo = 3.4;
  static const List<(double, double)> _arcs = <(double, double)>[(180, 270), (270, 360), (0, 90), (90, 180)];
  static const List<double> _angles = <double>[270, 180, 0, 90];

  @override
  void paint(Canvas canvas, Size size) {
    final double s = size.shortestSide / 96;
    canvas.translate(-2 * s, -2 * s);
    canvas.scale(s);
    const Offset c = Offset(50, 50);
    final Rect rect = Rect.fromCircle(center: c, radius: _r);
    for (int i = 0; i < 4; i++) {
      final double local = Curves.easeOutCubic.transform(((t - .3 - i * .1) / .45).clamp(0, 1));
      if (local <= 0) continue;
      final (double a0, double a1) = _arcs[i];
      canvas.drawArc(
        rect,
        a0 * math.pi / 180,
        (a1 - a0) * math.pi / 180 * local,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = _trait
          ..color = p.arcs[i],
      );
    }
    for (int i = 0; i < 4; i++) {
      final double local = ((t - i * .08) / .4).clamp(0, 1);
      if (local <= 0) continue;
      final double k = Curves.elasticOut.transform(local).clamp(0, 1.25);
      final double a = _angles[i] * math.pi / 180;
      final Offset o = c + Offset(math.cos(a), math.sin(a)) * _r;
      canvas.drawCircle(o, (_noeud + _halo / 2) * k, Paint()..color = fond ?? p.fond);
      canvas.drawCircle(o, _noeud * k, Paint()..color = p.noeuds[i]);
    }
  }

  @override
  bool shouldRepaint(covariant _SymbolePainter old) => old.t != t || old.p != p || old.fond != fond;
}

/// Logo horizontal : symbole + « KÓMBE » (+ signature facultative).
/// `compact` : le symbole seul. Taille de référence : [size] = hauteur du symbole.
class KombeLogo extends StatelessWidget {
  const KombeLogo({super.key, this.compact = false, this.size = 48, this.inverse = false, this.tagline = false, this.progression = 1});

  final bool compact;
  final double size;
  final bool inverse;
  final bool tagline;

  /// 0→1 : ouverture animée (nœuds, arcs, puis nom et signature).
  final double progression;

  @override
  Widget build(BuildContext context) {
    final KombeLogoVariante v = inverse ? KombeLogoVariante.inverse : KombeLogoVariante.couleur;
    final _Palette pal = _Palette.de(v);
    final Widget symbole = KombeSymbol(size: size, variante: v, progression: progression);
    if (compact) return Semantics(label: 'KÓMBE', image: true, child: symbole);
    final double texte = Curves.easeOutCubic.transform(((progression - .55) / .35).clamp(0, 1));
    final double sig = Curves.easeOutCubic.transform(((progression - .7) / .3).clamp(0, 1));
    final double fs = size * .5;
    return Semantics(
      label: tagline ? 'KÓMBE — Votre tontine, plus claire.' : 'KÓMBE',
      header: true,
      excludeSemantics: true,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          symbole,
          SizedBox(width: size * .22),
          Opacity(
            opacity: texte,
            child: Transform.translate(
              offset: Offset(0, (1 - texte) * 10),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(
                    'KÓMBE',
                    maxLines: 1,
                    softWrap: false,
                    style: TextStyle(fontFamily: KombeTokens.fontUi, fontSize: fs, height: 1.05, fontWeight: FontWeight.w800, letterSpacing: fs * .01, color: pal.texte),
                  ),
                  if (tagline)
                    Opacity(
                      opacity: sig,
                      child: Text(
                        'Votre tontine, plus claire.',
                        maxLines: 1,
                        softWrap: false,
                        style: TextStyle(fontFamily: KombeTokens.fontUi, fontSize: (fs * .42).clamp(11, 18), height: 1.3, fontWeight: FontWeight.w500, color: pal.signature),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Logo dont l'ouverture s'anime une fois (nœuds → arcs → nom → signature),
/// figé à l'état final si le système réduit les animations.
class KombeLogoAnime extends StatefulWidget {
  const KombeLogoAnime({super.key, this.size = 64, this.tagline = true, this.inverse = false, this.duree = const Duration(milliseconds: 1500)});
  final double size;
  final bool tagline;
  final bool inverse;
  final Duration duree;

  @override
  State<KombeLogoAnime> createState() => _KombeLogoAnimeState();
}

class _KombeLogoAnimeState extends State<KombeLogoAnime> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: widget.duree);
  bool _parti = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_parti) return;
    _parti = true;
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _c.value = 1;
    } else {
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: _c,
        builder: (BuildContext context, Widget? _) =>
            KombeLogo(size: widget.size, tagline: widget.tagline, inverse: widget.inverse, progression: _c.value),
      );
}

/// Couleur de fond par défaut du logo (pour les écrans qui l'entourent).
const Color kombeFondLogo = KombeColors.cream;
