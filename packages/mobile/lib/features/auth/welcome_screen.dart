import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_tokens.g.dart';
import '../../core/widgets/kombe_figure.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../l10n/app_localizations.dart';

/// Onboarding — couche B. Trois temps, une phrase chacun, racontés par la
/// même géométrie que le produit : des individus (nœuds dispersés) →
/// un cercle (le groupe) → un arc qui enregistre (la progression).
/// Les deux entrées (se connecter / créer un compte) restent toujours
/// visibles : l'utilisateur n'est jamais obligé de regarder l'histoire.
class WelcomeScreen extends StatefulWidget {
  const WelcomeScreen({super.key});

  @override
  State<WelcomeScreen> createState() => _WelcomeScreenState();
}

class _WelcomeScreenState extends State<WelcomeScreen> {
  final PageController _pages = PageController();
  int _step = 0;

  static const List<(String, String)> _story = <(String, String)>[
    ('Votre tontine.', 'Des personnes qui se font confiance, chacune avec sa part.'),
    ('Organisée ensemble.', 'Les règles sont votées, l’ordre des tours est visible par tous.'),
    ('Chaque étape reste claire.', 'Chaque cotisation est déclarée, validée et gardée en mémoire.'),
  ];

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextTheme t = Theme.of(context).textTheme;
    final bool reduce = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    return Scaffold(
      backgroundColor: KombeColors.cream,
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 0),
              child: Row(
                children: <Widget>[
                  const KombeLogo(size: 36),
                  const Spacer(),
                  Semantics(
                    label: 'Étape ${_step + 1} sur ${_story.length}',
                    child: ExcludeSemantics(
                      child: Row(
                        children: <Widget>[
                          for (int i = 0; i < _story.length; i++)
                            AnimatedContainer(
                              duration: KombeMotion.ui,
                              curve: KombeEasing.standard,
                              margin: const EdgeInsets.only(left: 6),
                              width: i == _step ? 20 : 7,
                              height: 7,
                              decoration: BoxDecoration(
                                color: i == _step ? KombeColors.gold : KombeColors.lineStrong,
                                borderRadius: BorderRadius.circular(99),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: LayoutBuilder(
                builder: (BuildContext context, BoxConstraints box) {
                  final double art = math.min(box.maxWidth - 48, math.max(150, box.maxHeight - 190));
                  return Column(
                    children: <Widget>[
                      const SizedBox(height: 12),
                      TweenAnimationBuilder<double>(
                        tween: Tween<double>(end: _step.toDouble()),
                        duration: reduce ? Duration.zero : KombeMotion.expressive,
                        curve: KombeEasing.brand,
                        builder: (BuildContext context, double stage, Widget? _) => SizedBox.square(
                          dimension: art,
                          child: ExcludeSemantics(child: CustomPaint(painter: _StoryPainter(stage))),
                        ),
                      ),
                      Expanded(
                        child: PageView.builder(
                          controller: _pages,
                          itemCount: _story.length,
                          onPageChanged: (int i) => setState(() => _step = i),
                          itemBuilder: (BuildContext context, int i) => Padding(
                            padding: const EdgeInsets.fromLTRB(28, 20, 28, 0),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(_story[i].$1, style: t.displaySmall),
                                const SizedBox(height: 10),
                                Text(_story[i].$2, style: t.bodyLarge?.copyWith(color: KombeColors.slate)),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ],
                  );
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(KombeSpacing.screen, 0, KombeSpacing.screen, 16),
              child: Column(
                children: <Widget>[
                  FilledButton(
                    onPressed: () => context.go('/login'),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        Text(l10n.signIn),
                        const SizedBox(width: 10),
                        const Icon(Icons.arrow_forward_rounded, size: 20),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  OutlinedButton(
                    onPressed: () => context.go('/register'),
                    child: Text(l10n.createAccount),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// stage 0 : six nœuds dispersés · 1 : ils forment l'anneau · 2 : l'arc enregistre.
class _StoryPainter extends CustomPainter {
  const _StoryPainter(this.stage);
  final double stage;

  @override
  void paint(Canvas canvas, Size size) {
    const int n = 6;
    final Offset c = size.center(Offset.zero);
    final double r = size.shortestSide * .36;
    final double gather = stage.clamp(0, 1);
    final double record = (stage - 1).clamp(0, 1);
    final Paint ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = size.shortestSide * .03
      ..strokeCap = StrokeCap.round;
    canvas.drawCircle(c, r, ring..color = KombeTokens.orbitRing.withValues(alpha: gather));
    if (record > 0) {
      canvas.drawArc(Rect.fromCircle(center: c, radius: r), -math.pi / 2, 2 * math.pi * (2 / n) * record, false,
          ring..color = KombeTokens.orbitArc);
    }
    const List<Offset> scatter = <Offset>[
      Offset(-.62, -.5), Offset(.5, -.66), Offset(.74, .12), Offset(.28, .7), Offset(-.46, .58), Offset(-.78, -.04),
    ];
    for (int i = 0; i < n; i++) {
      final double a = -math.pi / 2 + i * 2 * math.pi / n;
      final Offset onRing = c + Offset(math.cos(a), math.sin(a)) * r;
      final Offset free = c + scatter[i] * (size.shortestSide * .46);
      final Offset p = Offset.lerp(free, onRing, Curves.easeInOutCubic.transform(gather))!;
      final double nodeR = size.shortestSide * .055;
      final bool beneficiary = i == 2 && record > 0;
      final bool past = i < 2 && record > .5;
      final Color fill = beneficiary
          ? Color.lerp(KombeTokens.orbitFuture, KombeTokens.orbitBeneficiary, record)!
          : past
              ? KombeTokens.orbitPast
              : i == 0 && stage < .5
                  ? KombeTokens.accent
                  : KombeTokens.orbitFuture;
      if (beneficiary) canvas.drawCircle(p, nodeR * 2.2, Paint()..color = KombeTokens.accent.withValues(alpha: .16 * record));
      // Illustration (couche B) : chaque nœud est une personne.
      paintKombeFigure(
        canvas,
        p,
        nodeR * 1.35,
        fill: fill == KombeTokens.orbitFuture ? KombeTokens.surfaceRaised : fill,
        outline: fill == KombeTokens.orbitFuture ? KombeTokens.lineStrong : null,
        outlineWidth: 2.5,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _StoryPainter o) => o.stage != stage;
}
