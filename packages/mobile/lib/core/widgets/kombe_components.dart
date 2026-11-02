import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_spacing.dart';
import '../design/kombe_theme.dart';

/// Composants « Cercle & Ndop » partagés par tous les écrans.

/// Tonalité sémantique d'un état (pastilles, pictos, bandeaux).
enum KombeTone { neutral, brand, success, warning, danger, money, info }

extension KombeToneColors on KombeTone {
  Color get fg => switch (this) {
        KombeTone.neutral => KombeColors.slate,
        KombeTone.brand => KombeColors.forest,
        KombeTone.success => KombeColors.jade,
        KombeTone.warning => KombeColors.goldDark,
        KombeTone.danger => KombeColors.danger,
        KombeTone.money => KombeColors.goldDark,
        KombeTone.info => const Color(0xFF1F5C8A),
      };
  Color get bg => switch (this) {
        KombeTone.neutral => KombeColors.sand,
        KombeTone.brand => KombeColors.mint,
        KombeTone.success => const Color(0xFFE3F2EA),
        KombeTone.warning => const Color(0xFFFBF0DE),
        KombeTone.danger => const Color(0xFFFBEAE7),
        KombeTone.money => KombeColors.goldPale,
        KombeTone.info => const Color(0xFFE6EFF7),
      };
}

/// Montant FCFA : chiffres en Fraunces tabulaires, devise en petit Manrope.
class KombeAmount extends StatelessWidget {
  const KombeAmount(this.xaf, {super.key, this.size = 28, this.color = KombeColors.forest, this.signed = false});
  final int xaf;
  final double size;
  final Color color;
  /// Préfixe « + » / « − » (mouvements).
  final bool signed;

  static final NumberFormat _f = NumberFormat.decimalPattern('fr_FR');

  /// Groupes de milliers séparés par une espace insécable (U+00A0) : Fraunces
  /// n'a pas l'espace fine (U+202F) de `fr_FR`, qui disparaîtrait.
  static String digits(int v) => _f.format(v).replaceAll('\u202F', '\u00A0');

  @override
  Widget build(BuildContext context) {
    final String sign = signed ? (xaf < 0 ? '− ' : '+ ') : (xaf < 0 ? '− ' : '');
    return Semantics(
      label: '$sign${_f.format(xaf.abs())} francs CFA',
      excludeSemantics: true,
      child: Text.rich(
        TextSpan(
          children: <InlineSpan>[
            TextSpan(text: '$sign${digits(xaf.abs())}', style: KombeType.amount(size: size, color: color)),
            TextSpan(
              text: ' FCFA',
              style: TextStyle(fontSize: math.max(11, size * .42), fontWeight: FontWeight.w700, color: color.withValues(alpha: .72), letterSpacing: .2),
            ),
          ],
        ),
        maxLines: 1,
        softWrap: false,
        overflow: TextOverflow.fade,
      ),
    );
  }
}

/// Pastille d'état (texte toujours lisible, jamais la couleur seule).
class StatusPill extends StatelessWidget {
  const StatusPill(this.label, {super.key, this.tone = KombeTone.neutral, this.icon});
  final String label;
  final KombeTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(99)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (icon != null) ...<Widget>[Icon(icon, size: 14, color: tone.fg), const SizedBox(width: 4)],
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800, color: tone.fg, height: 1.2),
              ),
            ),
          ],
        ),
      );
}

/// Picto carré arrondi teinté (tête de rangée, tuiles).
class KombeIconBadge extends StatelessWidget {
  const KombeIconBadge(this.icon, {super.key, this.tone = KombeTone.brand, this.size = 42});
  final IconData icon;
  final KombeTone tone;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: tone.bg, borderRadius: BorderRadius.circular(size * .32)),
        child: Icon(icon, size: size * .5, color: tone.fg),
      );
}

/// Titre de section : libellé fort + action discrète à droite.
class KombeSection extends StatelessWidget {
  const KombeSection(this.title, {super.key, this.action, this.onAction, this.padding = const EdgeInsets.fromLTRB(KombeSpacing.screen, 26, 8, 8)});
  final String title;
  final String? action;
  final VoidCallback? onAction;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Padding(
        padding: padding,
        child: Row(
          children: <Widget>[
            Expanded(
              child: Semantics(
                header: true,
                child: Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800, color: KombeColors.forest, letterSpacing: -.2)),
              ),
            ),
            if (action != null && onAction != null) TextButton(onPressed: onAction, child: Text(action!)),
          ],
        ),
      );
}

/// Carte blanche à filet (radius 22) ; cliquable avec retour d'encre.
class KombeCard extends StatelessWidget {
  const KombeCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(18), this.color = Colors.white, this.borderColor = KombeColors.line});
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final Color color;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final BorderRadius r = BorderRadius.circular(KombeSpacing.cardRadius);
    return Material(
      color: color,
      shape: RoundedRectangleBorder(borderRadius: r, side: borderColor == null ? BorderSide.none : BorderSide(color: borderColor!)),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
    );
  }
}

/// Liste groupée : rangées dans une seule carte, séparées par un filet
/// (réglages, fiches, menus) — plus calme qu'une pile de cartes.
class KombeGroupedList extends StatelessWidget {
  const KombeGroupedList({super.key, required this.children, this.margin = const EdgeInsets.symmetric(horizontal: KombeSpacing.screen)});
  final List<Widget> children;
  final EdgeInsets margin;

  @override
  Widget build(BuildContext context) {
    final List<Widget> rows = <Widget>[];
    for (int i = 0; i < children.length; i++) {
      if (i > 0) rows.add(const Divider(height: 1, indent: 72));
      rows.add(children[i]);
    }
    return Padding(
      padding: margin,
      child: Material(
        color: Colors.white,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(KombeSpacing.cardRadius), side: const BorderSide(color: KombeColors.line)),
        clipBehavior: Clip.antiAlias,
        child: ListTileTheme.merge(
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(mainAxisSize: MainAxisSize.min, children: rows),
        ),
      ),
    );
  }
}

/// Illustration au trait des états vides : anneau de la marque, quatre nœuds,
/// un arc or — et le pictogramme du sujet au centre.
class KombeEmptyArt extends StatelessWidget {
  const KombeEmptyArt({super.key, required this.icon, this.size = 132, this.tone = KombeTone.brand});
  final IconData icon;
  final double size;
  final KombeTone tone;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: SizedBox.square(
          dimension: size,
          child: CustomPaint(
            painter: _EmptyArtPainter(tone.fg),
            child: Center(
              child: Container(
                width: size * .42,
                height: size * .42,
                decoration: BoxDecoration(color: tone.bg, shape: BoxShape.circle),
                child: Icon(icon, size: size * .2, color: tone.fg),
              ),
            ),
          ),
        ),
      );
}

class _EmptyArtPainter extends CustomPainter {
  _EmptyArtPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.shortestSide * .4;
    canvas.drawCircle(c, r, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4
      ..color = KombeColors.lineStrong);
    canvas.drawCircle(c, r * .78, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1
      ..color = KombeColors.line);
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), -math.pi / 2, math.pi * .62, false, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round
      ..color = KombeColors.goldWarm);
    for (int k = 0; k < 4; k++) {
      final double a = k * math.pi / 2 - math.pi / 4;
      final Offset p = c + Offset(math.cos(a), math.sin(a)) * r;
      canvas.drawCircle(p, 5, Paint()..color = KombeColors.cream);
      canvas.drawCircle(p, 5, Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1.6
        ..color = color);
    }
  }

  @override
  bool shouldRepaint(covariant _EmptyArtPainter old) => old.color != color;
}

/// Bloc de squelette : respire doucement (immobile si animations coupées).
class KombeSkeleton extends StatefulWidget {
  const KombeSkeleton({super.key, this.width, this.height = 14, this.radius = 8});
  final double? width;
  final double height;
  final double radius;

  @override
  State<KombeSkeleton> createState() => _KombeSkeletonState();
}

class _KombeSkeletonState extends State<KombeSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) {
      _c.stop();
    } else if (!_c.isAnimating) {
      _c.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: FadeTransition(
          opacity: Tween<double>(begin: .55, end: 1).animate(CurvedAnimation(parent: _c, curve: Curves.easeInOut)),
          child: Container(
            width: widget.width,
            height: widget.height,
            decoration: BoxDecoration(color: const Color(0xFFEDE5D3), borderRadius: BorderRadius.circular(widget.radius)),
          ),
        ),
      );
}

/// Squelette générique d'une page de liste (en-tête + rangées).
class KombeListSkeleton extends StatelessWidget {
  const KombeListSkeleton({super.key, this.rows = 6});
  final int rows;

  @override
  Widget build(BuildContext context) => Semantics(
        label: 'Chargement',
        // Borné : vue non défilante découpée ; non borné (dans une liste) : colonne.
        child: LayoutBuilder(
          builder: (BuildContext context, BoxConstraints c) {
            final Widget column = Padding(
              padding: const EdgeInsets.fromLTRB(KombeSpacing.screen, 20, KombeSpacing.screen, 0),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: _bones(),
              ),
            );
            return c.maxHeight.isFinite ? ClipRect(child: OverflowBox(alignment: Alignment.topCenter, maxHeight: double.infinity, child: column)) : column;
          },
        ),
      );

  List<Widget> _bones() => <Widget>[
            const KombeSkeleton(width: 180, height: 26, radius: 10),
            const SizedBox(height: 10),
            const KombeSkeleton(width: 240, height: 12),
            const SizedBox(height: 26),
            for (int i = 0; i < rows; i++)
              Padding(
                padding: const EdgeInsets.only(bottom: 18),
                child: Row(
                  children: <Widget>[
                    const KombeSkeleton(width: 42, height: 42, radius: 14),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          KombeSkeleton(width: i.isEven ? 170 : 130, height: 13),
                          const SizedBox(height: 8),
                          const KombeSkeleton(width: 96, height: 10),
                        ],
                      ),
                    ),
                    const KombeSkeleton(width: 64, height: 13),
                  ],
                ),
              ),
      ];
}

/// Anneau de cycle : piste, arc de progression, nœud du tour en cours ;
/// au centre « 4/12 » et « tour ». Lisible sur forêt (`onDark`) ou papier.
class KombeCycleRing extends StatelessWidget {
  const KombeCycleRing({super.key, required this.index, required this.total, this.size = 88, this.onDark = false});
  final int index;
  final int total;
  final double size;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final bool known = total > 0 && index > 0;
    final Color text = onDark ? KombeColors.cream : KombeColors.forest;
    return Semantics(
      label: known ? 'Tour $index sur $total' : 'Cycle non démarré',
      excludeSemantics: true,
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(
          painter: _CycleRingPainter(progress: known ? (index / total).clamp(0, 1) : 0, onDark: onDark),
          child: Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(known ? '$index/$total' : '—', style: KombeType.amount(size: size * .24, color: text)),
                Text('tour', style: TextStyle(fontSize: size * .12, fontWeight: FontWeight.w700, color: text.withValues(alpha: .7), height: 1.2)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _CycleRingPainter extends CustomPainter {
  _CycleRingPainter({required this.progress, required this.onDark});
  final double progress;
  final bool onDark;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double w = size.shortestSide * .075;
    final double r = size.shortestSide / 2 - w;
    canvas.drawCircle(c, r, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..color = onDark ? const Color(0x26FBF8F1) : KombeColors.mint);
    if (progress <= 0) return;
    final double sweep = math.pi * 2 * progress;
    canvas.drawArc(Rect.fromCircle(center: c, radius: r), -math.pi / 2, sweep, false, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w
      ..strokeCap = StrokeCap.round
      ..color = KombeColors.goldWarm);
    final double a = -math.pi / 2 + sweep;
    final Offset head = c + Offset(math.cos(a), math.sin(a)) * r;
    canvas.drawCircle(head, w * .95, Paint()..color = onDark ? KombeColors.cream : Colors.white);
    canvas.drawCircle(head, w * .95, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = w * .45
      ..color = KombeColors.goldWarm);
  }

  @override
  bool shouldRepaint(covariant _CycleRingPainter old) => old.progress != progress || old.onDark != onDark;
}

/// Pavé de date (calendrier) : jour en Fraunces, mois abrégé.
class KombeDateBlock extends StatelessWidget {
  const KombeDateBlock(this.date, {super.key, this.size = 56});
  final DateTime date;
  final double size;

  @override
  Widget build(BuildContext context) {
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final DateTime d = date.toLocal();
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(size * .3)),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Text('${d.day}', style: KombeType.amount(size: size * .4)),
            Text(
              DateFormat('MMM', locale).format(d).replaceAll('.', '').toUpperCase(),
              style: TextStyle(fontSize: size * .17, fontWeight: FontWeight.w800, color: KombeColors.jade, letterSpacing: .6, height: 1.1),
            ),
          ],
        ),
      ),
    );
  }
}
