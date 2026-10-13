import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../design/kombe_tokens.g.dart';

/// KÓMBE CYCLE ORBIT — composant signature.
///
/// Grammaire : anneau = groupe, nœud = tour, arc = progression, nœud or =
/// bénéficiaire du tour courant. `total` et `current` viennent TOUJOURS du
/// serveur (aucune valeur par défaut fabriquée). `current` est 1-indexé ;
/// 0 = cycle non démarré, `total + 1` = cycle terminé (anneau fermé).
///
/// Mouvement : convergence des nœuds puis tracé de l'arc (`KombeMotion.brand`),
/// une seule fois au premier affichage. Sous « animations réduites »
/// (MediaQuery.disableAnimations), état final immédiat.
class KombeCycleOrbit extends StatefulWidget {
  const KombeCycleOrbit({
    required this.total,
    required this.current,
    required this.semanticLabel,
    super.key,
    this.size = 240,
    this.center,
    this.onSelect,
    this.selected,
    this.animate = true,
  });

  final int total;
  final int current;
  final String semanticLabel;
  final double size;
  final Widget? center;
  final ValueChanged<int>? onSelect;
  final int? selected;
  final bool animate;

  @override
  State<KombeCycleOrbit> createState() => _KombeCycleOrbitState();
}

class _KombeCycleOrbitState extends State<KombeCycleOrbit> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: KombeMotion.brand + KombeMotion.expressive,
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final bool reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    if (!widget.animate || reduce) {
      _c.value = 1;
    } else if (_c.status == AnimationStatus.dismissed) {
      _c.forward();
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  _Geometry get _geo => _Geometry(widget.size, math.max(1, widget.total));

  void _tap(TapUpDetails d) {
    final ValueChanged<int>? on = widget.onSelect;
    if (on == null) return;
    final _Geometry g = _geo;
    for (int i = 0; i < g.n; i++) {
      if ((g.node(i) - d.localPosition).distance <= math.max(g.nodeR * 1.8, 22)) {
        HapticFeedback.selectionClick();
        on(i + 1);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final int total = math.max(1, widget.total);
    final int current = widget.current.clamp(0, total + 1);
    return Semantics(
      label: widget.semanticLabel,
      container: true,
      child: GestureDetector(
        onTapUp: widget.onSelect == null ? null : _tap,
        child: SizedBox.square(
          dimension: widget.size,
          child: Stack(
            alignment: Alignment.center,
            children: <Widget>[
              Positioned.fill(
                child: AnimatedBuilder(
                  animation: _c,
                  builder: (BuildContext context, Widget? _) => CustomPaint(
                    painter: KombeOrbitPainter(
                      total: total,
                      current: current,
                      selected: widget.selected,
                      t: _c.value,
                    ),
                  ),
                ),
              ),
              if (widget.center != null) ExcludeSemantics(child: widget.center!),
              // Cibles accessibles : un nœud = un bouton sémantique.
              if (widget.onSelect != null)
                for (int i = 0; i < total; i++)
                  Positioned(
                    left: _geo.node(i).dx - 24,
                    top: _geo.node(i).dy - 24,
                    width: 48,
                    height: 48,
                    child: Semantics(
                      button: true,
                      selected: widget.selected == i + 1,
                      label: 'Tour ${i + 1} sur $total, '
                          '${i + 1 < current ? 'passé' : i + 1 == current ? 'en cours' : 'à venir'}',
                      onTap: () {
                        HapticFeedback.selectionClick();
                        widget.onSelect!(i + 1);
                      },
                      child: const SizedBox.expand(),
                    ),
                  ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Geometry {
  _Geometry(this.size, this.n)
      : nodeR = math.max(4.5, math.min(size * .05, (math.pi * (size / 2 - 18)) / n / 2.4)),
        stroke = math.max(3, size * .032);
  final double size;
  final int n;
  final double nodeR;
  final double stroke;
  Offset get c => Offset(size / 2, size / 2);
  // Réserve la place du halo du bénéficiaire (2.1 × nodeR) : jamais rogné.
  double get r => size / 2 - nodeR * 2.15;
  double angle(int i) => -math.pi / 2 + i * 2 * math.pi / n;
  Offset node(int i) => c + Offset(math.cos(angle(i)), math.sin(angle(i))) * r;
}

class KombeOrbitPainter extends CustomPainter {
  const KombeOrbitPainter({required this.total, required this.current, required this.t, this.selected});
  final int total;
  final int current;
  final int? selected;
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final _Geometry g = _Geometry(size.shortestSide, total);
    final double nodesT = Curves.easeOutCubic.transform((t / .55).clamp(0, 1));
    final double arcT = KombeEasing.brand.transform(((t - .4) / .6).clamp(0, 1));
    final Paint ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = g.stroke
      ..color = KombeTokens.orbitRing.withValues(alpha: nodesT);
    canvas.drawCircle(g.c, g.r, ring);
    final double frac = current <= 1 ? 0 : math.min(1, (current - 1) / total);
    if (frac > 0) {
      canvas.drawArc(
        Rect.fromCircle(center: g.c, radius: g.r),
        -math.pi / 2,
        2 * math.pi * frac * arcT,
        false,
        Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = g.stroke
          ..strokeCap = StrokeCap.round
          ..color = KombeTokens.orbitArc,
      );
    }
    for (int i = 0; i < total; i++) {
      final int round = i + 1;
      final Offset target = g.node(i);
      // dispersion → convergence (les individus rejoignent le cercle)
      final double stagger = ((nodesT * 1.4) - i / total * .4).clamp(0, 1);
      final Offset from = g.c + (target - g.c) * 1.5;
      final Offset p = Offset.lerp(from, target, Curves.easeOutCubic.transform(stagger))!;
      final double op = stagger;
      if (round == current) {
        canvas.drawCircle(p, g.nodeR * 2.1, Paint()..color = KombeTokens.orbitBeneficiary.withValues(alpha: .18 * arcT));
        canvas.drawCircle(p, g.nodeR * 1.18, Paint()..color = KombeTokens.orbitBeneficiary.withValues(alpha: op));
      } else if (round < current) {
        canvas.drawCircle(p, g.nodeR, Paint()..color = KombeTokens.orbitPast.withValues(alpha: op));
      } else {
        canvas.drawCircle(p, g.nodeR, Paint()..color = KombeTokens.orbitFuture.withValues(alpha: op));
        canvas.drawCircle(
          p,
          g.nodeR,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = math.max(1.5, g.stroke * .6)
            ..color = KombeTokens.lineStrong.withValues(alpha: op),
        );
      }
      if (selected == round) {
        canvas.drawCircle(
          p,
          g.nodeR * 1.6,
          Paint()
            ..style = PaintingStyle.stroke
            ..strokeWidth = 2
            ..color = KombeTokens.contentPrimary,
        );
      }
    }
  }

  @override
  bool shouldRepaint(covariant KombeOrbitPainter o) =>
      o.t != t || o.current != current || o.total != total || o.selected != selected;
}
