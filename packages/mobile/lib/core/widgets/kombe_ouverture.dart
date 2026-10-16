import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import 'kombe_logo.dart';

/// Écran d'ouverture animé de l'application (charte : mouvement de marque).
/// Prend le relais sans coupure de l'écran natif Android (fond sable +
/// symbole) : les quatre nœuds-membres arrivent, l'anneau se trace, puis le
/// nom et la signature ; l'écran s'efface ensuite vers l'application, qui se
/// charge dessous pendant ce temps. Durée totale ≈ 1,9 s ; immédiat si le
/// système réduit les animations. Aucun minuteur : tout est porté par
/// l'AnimationController.
class KombeOuverture extends StatefulWidget {
  const KombeOuverture({required this.child, super.key});
  final Widget child;

  @override
  State<KombeOuverture> createState() => _KombeOuvertureState();
}

class _KombeOuvertureState extends State<KombeOuverture> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1900))
    ..addStatusListener((AnimationStatus s) {
      if (s == AnimationStatus.completed && mounted) setState(() => _fini = true);
    });
  bool _fini = false;
  bool _parti = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_parti) return;
    _parti = true;
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _fini = true;
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
  Widget build(BuildContext context) {
    if (_fini) return widget.child;
    return Stack(
      fit: StackFit.expand,
      children: <Widget>[
        widget.child,
        AnimatedBuilder(
          animation: _c,
          builder: (BuildContext context, Widget? _) {
            final double t = _c.value;
            final double logo = (t / .8).clamp(0, 1);
            final double sortie = Curves.easeInCubic.transform(((t - .8) / .2).clamp(0, 1));
            return IgnorePointer(
              ignoring: sortie > .5,
              child: Opacity(
                opacity: 1 - sortie,
                child: Transform.scale(
                  scale: 1 + sortie * .04,
                  child: DecoratedBox(
                    decoration: const BoxDecoration(
                      gradient: RadialGradient(
                        center: Alignment(0, -.2),
                        radius: 1.1,
                        colors: <Color>[Colors.white, KombeColors.cream, KombeColors.sand],
                        stops: <double>[0, .6, 1],
                      ),
                    ),
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: <Widget>[
                          KombeLogo(size: 72, tagline: true, progression: logo),
                          const SizedBox(height: 40),
                          _Piste(t: t),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _Piste extends StatelessWidget {
  const _Piste({required this.t});
  final double t;

  @override
  Widget build(BuildContext context) => Container(
        width: 120,
        height: 3,
        decoration: BoxDecoration(color: KombeColors.line, borderRadius: BorderRadius.circular(3)),
        alignment: Alignment.centerLeft,
        child: FractionallySizedBox(
          widthFactor: Curves.easeInOutCubic.transform(t.clamp(0, 1)),
          child: Container(decoration: BoxDecoration(color: KombeColors.emerald, borderRadius: BorderRadius.circular(3))),
        ),
      );
}
