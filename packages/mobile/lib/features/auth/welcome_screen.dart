import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../l10n/app_localizations.dart';

/// Accueil / onboarding (maquette « Écran de bienvenue ») : photo de marque,
/// promesse, trois bénéfices, deux entrées.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextTheme t = Theme.of(context).textTheme;
    final double photoH = (MediaQuery.sizeOf(context).height * .36).clamp(220, 340);
    return Scaffold(
      backgroundColor: KombeColors.cream,
      body: Column(
        children: <Widget>[
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  SizedBox(
                    height: photoH,
                    width: double.infinity,
                    child: Stack(
                      fit: StackFit.expand,
                      children: <Widget>[
                        Image.asset(KombePhotos.portrait, fit: BoxFit.cover, alignment: const Alignment(.1, -.3), excludeFromSemantics: true),
                        const DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              stops: <double>[0, .45, 1],
                              colors: <Color>[Color(0xCCFBF8F1), Color(0x00FBF8F1), KombeColors.cream],
                            ),
                          ),
                        ),
                        const SafeArea(
                          bottom: false,
                          child: Padding(
                            padding: EdgeInsets.fromLTRB(22, 14, 22, 0),
                            child: Align(alignment: Alignment.topLeft, child: KombeLogo(size: 50)),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 0, 24, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text('Ensemble pour aller plus loin.', style: t.displaySmall?.copyWith(color: KombeColors.ink, fontSize: 38, height: 1.05)),
                        const SizedBox(height: 12),
                        Text(
                          'La solution de tontine moderne et transparente pour vos communautés en Afrique.',
                          style: t.bodyLarge?.copyWith(color: KombeColors.ink),
                        ),
                        const SizedBox(height: 22),
                        const _Benefit(icon: Icons.groups_rounded, title: 'Épargnez\nen groupe'),
                        const _Benefit(icon: Icons.verified_user_rounded, title: 'Suivez chaque\ncotisation'),
                        const _Benefit(icon: Icons.bar_chart_rounded, title: 'Construisez\nvos projets ensemble'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(KombeSpacing.screen, 4, KombeSpacing.screen, 12),
              child: Column(
                children: <Widget>[
                  FilledButton(
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
                    onPressed: () => context.go('/register'),
                    child: Text(l10n.createAccount),
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

class _Benefit extends StatelessWidget {
  const _Benefit({required this.icon, required this.title});
  final IconData icon;
  final String title;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(
          children: <Widget>[
            Container(
              width: 50,
              height: 50,
              decoration: BoxDecoration(color: KombeColors.gold.withValues(alpha: .14), shape: BoxShape.circle),
              child: Icon(icon, color: KombeColors.goldDark, size: 24),
            ),
            const SizedBox(width: 14),
            Expanded(child: Text(title, style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 15, height: 1.25))),
          ],
        ),
      );
}
