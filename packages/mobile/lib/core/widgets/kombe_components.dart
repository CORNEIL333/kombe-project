import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_spacing.dart';
import '../design/kombe_theme.dart';

/// Composants « Ndop » partagés par tous les écrans.

/// Tonalité sémantique d'un état (pastilles, pictos, bandeaux).
enum KombeTone { neutral, brand, success, warning, danger, money, info }

/// Trois teintes par écran : vert, safran, neutres. Rouge : retard et erreur.
extension KombeToneColors on KombeTone {
  Color get fg => switch (this) {
        KombeTone.neutral => KombeColors.slate,
        KombeTone.warning || KombeTone.money => KombeColors.ink,
        KombeTone.danger => KombeColors.danger,
        KombeTone.brand || KombeTone.success || KombeTone.info => KombeColors.forest,
      };
  Color get bg => switch (this) {
        KombeTone.neutral => KombeColors.sand,
        KombeTone.warning || KombeTone.money => KombeColors.goldPale,
        KombeTone.danger => const Color(0xFFFBEAE7),
        KombeTone.brand || KombeTone.success || KombeTone.info => KombeColors.mint,
      };
}

/// Montant FCFA : chiffres tabulaires, devise en petit Manrope.
class KombeAmount extends StatelessWidget {
  const KombeAmount(this.xaf, {super.key, this.size = 28, this.color = KombeColors.forest, this.signed = false});
  final int xaf;
  final double size;
  final Color color;
  /// Préfixe « + » / « − » (mouvements).
  final bool signed;

  static final NumberFormat _f = NumberFormat.decimalPattern('fr_FR');

  /// Groupes de milliers séparés par une espace insécable (U+00A0) : certaines
  /// polices n'ont pas l'espace fine (U+202F) de `fr_FR`.
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
              style: TextStyle(fontSize: math.max(14, size * .42), fontWeight: FontWeight.w700, color: color.withValues(alpha: .72), letterSpacing: .2),
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
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: tone.fg, height: 1.2),
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
        decoration: BoxDecoration(color: tone.bg, shape: BoxShape.circle),
        child: Icon(icon, size: size * .5, color: tone.fg),
      );
}

/// Titre de section : libellé fort + action discrète à droite.
class KombeSection extends StatelessWidget {
  const KombeSection(this.title, {super.key, this.action, this.onAction, this.padding = const EdgeInsets.fromLTRB(KombeSpacing.screen, 28, 8, 6)});
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
                child: Text(title, style: KombeType.display(size: 23)),
              ),
            ),
            if (action != null && onAction != null) TextButton(onPressed: onAction, child: Text(action!)),
          ],
        ),
      );
}

/// Carte blanche à filet (radius 22) ; cliquable avec retour d'encre.
class KombeCard extends StatelessWidget {
  const KombeCard({super.key, required this.child, this.onTap, this.padding = const EdgeInsets.all(18), this.color = Colors.white, this.borderColor});
  final Widget child;
  final VoidCallback? onTap;
  final EdgeInsets padding;
  final Color color;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    final BorderSide side = borderColor == null ? BorderSide.none : BorderSide(color: borderColor!);
    return Material(
      color: color,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(KombeSpacing.cardRadius), side: side),
      clipBehavior: Clip.antiAlias,
      child: InkWell(onTap: onTap, child: Padding(padding: padding, child: child)),
    );
  }
}

/// Liste cousue : les rangées posées sur le fond, séparées par un point de
/// couture. Pas de carte autour : c'est le rythme qui structure.
class KombeGroupedList extends StatelessWidget {
  const KombeGroupedList({super.key, required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final List<Widget> rows = <Widget>[];
    for (int i = 0; i < children.length; i++) {
      if (i > 0) rows.add(const KombeStitch());
      rows.add(children[i]);
    }
    return Material(type: MaterialType.transparency, child: Column(mainAxisSize: MainAxisSize.min, children: rows));
  }
}

/// Point de couture : horizontal entre deux rangées, vertical pour une frise.
class KombeStitch extends StatelessWidget {
  const KombeStitch({super.key, this.vertical = false, this.indent = KombeSpacing.screen});
  final bool vertical;
  final double indent;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Padding(
          padding: vertical ? EdgeInsets.zero : EdgeInsets.symmetric(horizontal: indent),
          child: CustomPaint(size: vertical ? const Size(2, double.infinity) : const Size(double.infinity, 2), painter: _StitchPainter(vertical)),
        ),
      );
}

class _StitchPainter extends CustomPainter {
  _StitchPainter(this.vertical);
  final bool vertical;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint p = Paint()
      ..color = KombeColors.lineStrong
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    final double end = vertical ? size.height : size.width;
    for (double x = 0; x < end; x += 10) {
      canvas.drawLine(vertical ? Offset(1, x) : Offset(x, 1), vertical ? Offset(1, x + 4) : Offset(x + 4, 1), p);
    }
  }

  @override
  bool shouldRepaint(covariant _StitchPainter o) => false;
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

/// Pavé de date (calendrier) : jour en grand, mois abrégé.
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
              style: TextStyle(fontSize: math.max(14, size * .22), fontWeight: FontWeight.w800, color: KombeColors.forest, height: 1.1),
            ),
          ],
        ),
      ),
    );
  }
}

/// Rangée de menu (dans une [KombeGroupedList]) : picto teinté, titre,
/// détail facultatif, valeur ; chevron, ou flèche sortante si la tâche
/// s'ouvre dans KÓMBE Web.
class KombeMenuRow extends StatelessWidget {
  const KombeMenuRow({
    super.key,
    required this.icon,
    required this.title,
    required this.onTap,
    this.subtitle,
    this.value,
    this.tone = KombeTone.brand,
    this.external = false,
  });
  final IconData icon;
  final String title;
  final String? subtitle;
  final String? value;
  final VoidCallback onTap;
  final KombeTone tone;
  final bool external;

  @override
  Widget build(BuildContext context) => ListTile(
        minTileHeight: subtitle == null ? 60 : 68,
        leading: KombeIconBadge(icon, tone: tone, size: 38),
        title: Text(title),
        subtitle: subtitle == null ? null : Text(subtitle!),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (value != null) Text(value!, style: Theme.of(context).textTheme.bodyMedium),
            const SizedBox(width: 4),
            Icon(
              external ? Icons.open_in_new_rounded : Icons.chevron_right_rounded,
              size: external ? 18 : 24,
              color: KombeColors.slate,
              semanticLabel: external ? 'ouvre KÓMBE Web' : null,
            ),
          ],
        ),
        onTap: onTap,
      );
}

/// Fait en lecture seule (fiches, reçus) : picto neutre, libellé, valeur.
class KombeFact extends StatelessWidget {
  const KombeFact({super.key, required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => ListTile(
        minTileHeight: 62,
        leading: KombeIconBadge(icon, tone: KombeTone.neutral, size: 38),
        title: Text(label, style: Theme.of(context).textTheme.bodyMedium),
        subtitle: Text(value, style: Theme.of(context).textTheme.titleMedium),
      );
}

/// Tête de formulaire : picto de la tâche, titre serif, une phrase utile.
class KombeFormHeader extends StatelessWidget {
  const KombeFormHeader({super.key, required this.icon, required this.title, required this.body, this.tone = KombeTone.brand});
  final IconData icon;
  final String title;
  final String body;
  final KombeTone tone;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: <Widget>[
        KombeIconBadge(icon, tone: tone, size: 54),
        const SizedBox(height: 18),
        Semantics(header: true, child: Text(title, style: t.headlineMedium)),
        const SizedBox(height: 8),
        Text(body, style: t.bodyLarge?.copyWith(color: KombeColors.slate)),
        const SizedBox(height: 26),
      ],
    );
  }
}

/// Message d'erreur en ligne, sous le champ concerné, annoncé au lecteur d'écran.
class KombeInlineError extends StatelessWidget {
  const KombeInlineError(this.message, {super.key});
  final String message;

  @override
  Widget build(BuildContext context) => Semantics(
        liveRegion: true,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: KombeTone.danger.bg, borderRadius: BorderRadius.circular(KombeSpacing.tileRadius)),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              const Icon(Icons.error_outline_rounded, size: 18, color: KombeColors.danger),
              const SizedBox(width: 10),
              Expanded(child: Text(message, style: const TextStyle(color: KombeColors.danger, fontWeight: FontWeight.w600, fontSize: 14))),
            ],
          ),
        ),
      );
}

/// Points du cycle, discrets : un par tour, pleins quand le tour est passé,
/// safran pour le tour en cours, vides à venir. `mine` marque mon tour.
class KombeCycleBand extends StatelessWidget {
  const KombeCycleBand({super.key, required this.index, required this.total, this.mine, this.onDark = false, this.height = 12, this.late = false});
  final int index;
  final int total;
  final int? mine;
  final bool onDark;
  final double height;
  /// Tour en retard : le point en cours passe au rouge.
  final bool late;

  @override
  Widget build(BuildContext context) {
    if (total <= 0) return const SizedBox.shrink();
    return Semantics(
      label: 'Tour $index sur $total',
      excludeSemantics: true,
      child: TweenAnimationBuilder<double>(
        tween: Tween<double>(begin: (MediaQuery.maybeDisableAnimationsOf(context) ?? false) ? 1 : 0, end: 1),
        duration: const Duration(milliseconds: 700),
        curve: Curves.easeOutCubic,
        builder: (BuildContext context, double t, Widget? _) => CustomPaint(
          size: Size(double.infinity, height),
          painter: _CycleBandPainter(index: index, total: total, mine: mine, onDark: onDark, t: t, late: late),
        ),
      ),
    );
  }
}

class _CycleBandPainter extends CustomPainter {
  _CycleBandPainter({required this.index, required this.total, required this.mine, required this.onDark, required this.t, this.late = false});
  final int index;
  final int total;
  final int? mine;
  final bool onDark;
  final double t;
  final bool late;

  @override
  void paint(Canvas canvas, Size size) {
    final double step = math.min(size.width / total, 17);
    final double r = math.min(5, step / 2 - .8);
    final Color done = onDark ? Colors.white : KombeColors.brand;
    final Color empty = onDark ? const Color(0x80FFFFFF) : KombeColors.lineStrong;
    final Color now = late ? KombeColors.danger : KombeColors.goldWarm;
    for (int i = 1; i <= total; i++) {
      final Offset c = Offset((i - .5) * step, size.height / 2);
      final double reveal = ((t * (index + 1)) - (i - 1)).clamp(0, 1);
      if (i <= index && reveal > 0) {
        if (i == index && onDark) canvas.drawCircle(c, (r + 1.6) * reveal, Paint()..color = Colors.white);
        canvas.drawCircle(c, r * reveal, Paint()..color = i == index ? now : done);
      } else {
        canvas.drawCircle(c, r - .7, Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.3
          ..color = empty);
      }
      if (mine == i) canvas.drawCircle(Offset(c.dx, size.height + 6), 2.5, Paint()..color = done);
    }
  }

  @override
  bool shouldRepaint(covariant _CycleBandPainter o) => o.index != index || o.total != total || o.mine != mine || o.onDark != onDark || o.t != t || o.late != late;
}

/// Sceau de confirmation : un disque émeraude qui se pose, puis s'efface.
/// Le moment « paiement confirmé » a son propre geste ; immobile si les
/// animations sont coupées.
void showKombeSeal(BuildContext context, String label) {
  final OverlayState overlay = Overlay.of(context, rootOverlay: true);
  late final OverlayEntry entry;
  entry = OverlayEntry(builder: (_) => _Seal(label: label, onDone: () => entry.remove()));
  overlay.insert(entry);
}

class _Seal extends StatefulWidget {
  const _Seal({required this.label, required this.onDone});
  final String label;
  final VoidCallback onDone;

  @override
  State<_Seal> createState() => _SealState();
}

class _SealState extends State<_Seal> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));

  @override
  void initState() {
    super.initState();
    _c.forward().whenComplete(() {
      if (mounted) widget.onDone();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bool still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final Animation<double> scale = still ? const AlwaysStoppedAnimation<double>(1) : CurvedAnimation(parent: _c, curve: const Interval(0, .4, curve: Curves.elasticOut));
    final Animation<double> fade = ReverseAnimation(CurvedAnimation(parent: _c, curve: const Interval(.75, 1)));
    return IgnorePointer(
      child: Center(
        child: FadeTransition(
          opacity: fade,
          child: ScaleTransition(
            scale: scale,
            child: Container(
              width: 148,
              height: 148,
              decoration: const BoxDecoration(color: KombeColors.brand, shape: BoxShape.circle),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: <Widget>[
                  const Icon(Icons.check_rounded, size: 54, color: Colors.white),
                  Text(widget.label, style: const TextStyle(decoration: TextDecoration.none, color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
