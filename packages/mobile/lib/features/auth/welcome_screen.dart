import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/kombe_motion.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../l10n/app_localizations.dart';

/// Accueil / onboarding : scène photographique plein écran (direction
/// « L'Orbite »), promesse en Manrope + une phrase Newsreader, trois
/// bénéfices sur verre sombre, deux entrées. La photo est une illustration
/// d'ambiance (décorative) ; aucune donnée n'est affichée.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      backgroundColor: KombeColors.night,
      body: Stack(
        fit: StackFit.expand,
        children: <Widget>[
          const KombeBreathingPhoto(asset: KombePhotos.portrait, alignment: Alignment(.15, -.4)),
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                stops: <double>[0, .28, .55, 1],
                colors: <Color>[Color(0x99061F1B), Color(0x22061F1B), Color(0xDD061F1B), KombeColors.night],
              ),
            ),
          ),
          SafeArea(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Padding(
                  padding: EdgeInsets.fromLTRB(22, 14, 22, 0),
                  child: KombeEntrance(child: KombeLogo(size: 46, inverse: true, tagline: true)),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    reverse: true,
                    padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        KombeEntrance(
                          index: 1,
                          child: Text(
                            'Ensemble pour',
                            style: t.displaySmall?.copyWith(color: KombeColors.cream, fontSize: 40, height: 1.02, letterSpacing: -1.2),
                          ),
                        ),
                        KombeEntrance(index: 2, child: Text('aller plus loin.', style: KombeType.accent(size: 42, color: KombeColors.goldLight))),
                        const SizedBox(height: 14),
                        KombeEntrance(
                          index: 3,
                          child: Text(
                            'La solution de tontine moderne et transparente pour vos communautés en Afrique.',
                            style: t.bodyLarge?.copyWith(color: KombeColors.cream.withValues(alpha: .86)),
                          ),
                        ),
                        const SizedBox(height: 20),
                        const KombeEntrance(index: 4, child: _Benefit(icon: Icons.groups_rounded, title: 'Cotisez en groupe')),
                        const KombeEntrance(index: 5, child: _Benefit(icon: Icons.verified_user_rounded, title: 'Suivez chaque cotisation')),
                        const KombeEntrance(index: 6, child: _Benefit(icon: Icons.bar_chart_rounded, title: 'Construisez vos projets ensemble')),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(KombeSpacing.screen, 4, KombeSpacing.screen, 12),
                  child: KombeEntrance(
                    index: 7,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        FilledButton(
                          style: FilledButton.styleFrom(backgroundColor: KombeColors.goldLight, foregroundColor: KombeColors.ink),
                          onPressed: () => context.go('/login'),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: <Widget>[
                              Text(l10n.signIn),
                              const SizedBox(width: 12),
                              const Icon(Icons.arrow_forward_rounded),
                            ],
                          ),
                        ),
                        const SizedBox(height: 10),
                        OutlinedButton(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: KombeColors.cream,
                            side: BorderSide(color: KombeColors.cream.withValues(alpha: .45)),
                          ),
                          onPressed: () => context.go('/register'),
                          child: Text(l10n.createAccount),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Benefit extends StatelessWidget {
  const _Benefit({required this.icon, required this.title});
  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: KombeColors.night.withValues(alpha: .45),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: KombeColors.cream.withValues(alpha: .14)),
        ),
        child: Row(
          children: <Widget>[
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: KombeColors.goldLight.withValues(alpha: .16), shape: BoxShape.circle),
              child: Icon(icon, color: KombeColors.goldLight, size: 21),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 15, height: 1.25, color: KombeColors.cream),
              ),
            ),
          ],
        ),
      );
}
