import 'package:flutter/material.dart';

/// Mouvement de marque (direction « L'Orbite ») : entrées courtes, douces,
/// jamais bloquantes. Tout est désactivé quand le système demande de réduire
/// les animations (`MediaQuery.disableAnimations`) : le contenu s'affiche
/// alors directement à sa place.

bool _reduce(BuildContext context) => MediaQuery.maybeDisableAnimationsOf(context) ?? false;

/// Entrée d'un élément : fondu + légère montée, avec un délai (cascade).
class KombeEntrance extends StatefulWidget {
  const KombeEntrance({required this.child, super.key, this.index = 0, this.step = const Duration(milliseconds: 70), this.offset = 18});
  final Widget child;

  /// Rang dans la cascade (0 = premier).
  final int index;
  final Duration step;
  final double offset;

  @override
  State<KombeEntrance> createState() => _KombeEntranceState();
}

class _KombeEntranceState extends State<KombeEntrance> with SingleTickerProviderStateMixin {
  static const Duration _run = Duration(milliseconds: 520);
  late final Duration _delay = widget.step * widget.index.clamp(0, 10);
  // Le délai fait partie de l'animation (Interval) : aucun minuteur en attente.
  late final AnimationController _c = AnimationController(vsync: this, duration: _run + _delay);
  late final Animation<double> _t = CurvedAnimation(
    parent: _c,
    curve: Interval(_delay.inMicroseconds / (_run + _delay).inMicroseconds, 1, curve: const Cubic(0, .4, 0, 1)),
  );
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (_reduce(context)) {
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
        animation: _t,
        child: widget.child,
        builder: (BuildContext context, Widget? child) => Opacity(
          opacity: _t.value,
          child: Transform.translate(offset: Offset(0, (1 - _t.value) * widget.offset), child: child),
        ),
      );
}

/// Photo d'ambiance qui « se pose » : un seul zoom arrière lent (effet Ken
/// Burns, 12 s) puis immobile ; figée si les animations sont réduites.
/// Fini (jamais en boucle) pour ne pas consommer de batterie. Décorative.
class KombeBreathingPhoto extends StatefulWidget {
  const KombeBreathingPhoto({required this.asset, super.key, this.alignment = Alignment.center});
  final String asset;
  final Alignment alignment;

  @override
  State<KombeBreathingPhoto> createState() => _KombeBreathingPhotoState();
}

class _KombeBreathingPhotoState extends State<KombeBreathingPhoto> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(seconds: 12));
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (_reduce(context)) {
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
  Widget build(BuildContext context) => ExcludeSemantics(
        child: ClipRect(
          child: AnimatedBuilder(
            animation: _c,
            builder: (BuildContext context, Widget? child) => Transform.scale(
              scale: 1.12 - Curves.easeOutCubic.transform(_c.value) * .1,
              alignment: widget.alignment,
              child: child,
            ),
            child: Image.asset(widget.asset, fit: BoxFit.cover, alignment: widget.alignment),
          ),
        ),
      );
}
