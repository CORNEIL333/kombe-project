import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_icons.g.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/widgets/kombe_icon.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/kombe_motion.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../l10n/app_localizations.dart';

/// Accueil / onboarding, conforme à la charte : interface claire, photo
/// lumineuse en tête (illustration décorative), logo de la marque, titre
/// Manrope ExtraBold, bénéfices en pastilles sable, bouton primaire vert forêt et
/// bouton secondaire. Entrées en cascade ; aucune donnée affichée.
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    final TextTheme t = Theme.of(context).textTheme;
    final double photoH = (MediaQuery.sizeOf(context).height * .42).clamp(240, 380);
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
                        const KombeBreathingPhoto(asset: KombePhotos.portrait, alignment: Alignment(.1, -.3)),
                        const DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              stops: <double>[0, .55, 1],
                              colors: <Color>[Color(0x00FBF8F1), Color(0x33FBF8F1), KombeColors.cream],
                            ),
                          ),
                        ),
                        SafeArea(
                          bottom: false,
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(18, 12, 18, 0),
                            child: Align(
                              alignment: Alignment.topLeft,
                              child: KombeEntrance(
                                child: Container(
                                  padding: const EdgeInsets.fromLTRB(10, 8, 16, 8),
                                  decoration: BoxDecoration(
                                    color: Colors.white.withValues(alpha: .9),
                                    borderRadius: BorderRadius.circular(18),
                                    boxShadow: const <BoxShadow>[BoxShadow(color: Color(0x22103C32), blurRadius: 18, offset: Offset(0, 6))],
                                  ),
                                  child: const KombeLogo(size: 38),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(24, 4, 24, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        KombeEntrance(
                          index: 0,
                          child: Container(
                            margin: const EdgeInsets.only(bottom: 14),
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              color: KombeColors.mint,
                              borderRadius: BorderRadius.circular(999),
                              border: Border.all(color: KombeColors.emerald.withValues(alpha: .28)),
                            ),
                            child: Text(
                              'TONTINE NUMÉRIQUE',
                              style: t.labelMedium?.copyWith(color: KombeColors.emerald, fontWeight: FontWeight.w700, letterSpacing: 1.6),
                            ),
                          ),
                        ),
                        KombeEntrance(index: 1, child: Text('Votre tontine,', style: KombeType.titre(size: 36, height: 1.0))),
                        KombeEntrance(index: 2, child: Text('plus claire.', style: KombeType.accent(size: 36, height: 1.0))),
                        const SizedBox(height: 12),
                        KombeEntrance(
                          index: 3,
                          child: Text(
                            'Cotisations, tours, caisses et séances de votre tontine ou association, dans un registre que chaque membre vérifie. '
                            'L’argent reste entre vos mains.',
                            style: t.bodyLarge?.copyWith(color: KombeColors.ink),
                          ),
                        ),
                        const SizedBox(height: 20),
                        const KombeEntrance(index: 4, child: _Benefit(icon: KombeIconData.groupes, title: 'Cotisations et tours au registre')),
                        const KombeEntrance(index: 5, child: _Benefit(icon: KombeIconData.confirmer, title: 'Vos caisses, avec vos propres règles')),
                        const KombeEntrance(index: 6, child: _Benefit(icon: KombeIconData.tableau, title: 'Séances, votes et procès-verbaux')),
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
              child: KombeEntrance(
                index: 7,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: <Widget>[
                    FilledButton(
                      onPressed: () => context.go('/login'),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: <Widget>[
                          Text(l10n.signIn),
                          const SizedBox(width: 12),
                          const KombeIcon(KombeIconData.fleche, size: 20, color: Colors.white),
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
          ),
        ],
      ),
    );
  }
}

class _Benefit extends StatelessWidget {
  const _Benefit({required this.icon, required this.title});
  final String icon;
  final String title;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          boxShadow: const <BoxShadow>[BoxShadow(color: Color(0x14103C32), blurRadius: 10, offset: Offset(0, 3))],
        ),
        child: Row(
          children: <Widget>[
            KombePastille(icon, size: 42),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                title,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(fontSize: 15, height: 1.25, color: KombeColors.forest, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      );
}
