import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_tokens.g.dart';
import '../../l10n/app_localizations.dart';

/// Moment de confirmation après une déclaration ACCEPTÉE par le serveur.
/// L'arc se trace mais reste OUVERT : la cotisation est envoyée, pas validée.
/// L'anneau fermé est réservé à la validation par un membre autorisé.
Future<void> showContributionSentSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (BuildContext context) => const ContributionSentView(),
    );

class ContributionSentView extends StatelessWidget {
  const ContributionSentView({super.key});

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final bool reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: reduce ? 1 : 0, end: 1),
              duration: KombeMotion.expressive,
              curve: KombeEasing.brand,
              builder: (BuildContext context, double v, Widget? _) => SizedBox.square(
                dimension: 112,
                child: CustomPaint(painter: _OpenArcPainter(v)),
              ),
            ),
            const SizedBox(height: 18),
            Semantics(
              liveRegion: true,
              child: Text(AppLocalizations.of(context).ssPaiementEnvoye, style: t.headlineSmall, textAlign: TextAlign.center),
            ),
            const SizedBox(height: 6),
            Text(
              AppLocalizations.of(context).ssLaTresorerieVaLeConfirmer,
              style: t.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 22),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(),
              child: Text(AppLocalizations.of(context).ssRetourLaccueil),
            ),
          ],
        ),
      ),
    );
  }
}

class _OpenArcPainter extends CustomPainter {
  const _OpenArcPainter(this.t);
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.shortestSide / 2 - 8;
    final Rect rect = Rect.fromCircle(center: c, radius: r);
    canvas.drawCircle(
      c,
      r,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..color = KombeColors.lineStrong,
    );
    // Arc ouvert : s'arrête à 72 % — la fermeture appartient au validateur.
    canvas.drawArc(
      rect,
      -math.pi / 2,
      2 * math.pi * .72 * t,
      false,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 10
        ..strokeCap = StrokeCap.round
        ..color = KombeColors.goldWarm,
    );
    // Le nœud du déclarant, à l'origine de l'arc.
    canvas.drawCircle(Offset(c.dx, c.dy - r), 9, Paint()..color = KombeColors.forest);
    canvas.drawCircle(
      Offset(c.dx, c.dy - r),
      9,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 3
        ..color = KombeColors.cream,
    );
  }

  @override
  bool shouldRepaint(covariant _OpenArcPainter o) => o.t != t;
}
