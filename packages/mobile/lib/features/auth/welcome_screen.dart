import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/widgets/african_pattern_band.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../l10n/app_localizations.dart';

class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      backgroundColor: KombeColors.cream,
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 28, 24, 12),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 520),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const KombeLogo(size: 54),
                      const SizedBox(height: 52),
                      Text(
                        l10n.welcomeTitle,
                        style: Theme.of(context).textTheme.displaySmall,
                      ),
                      const SizedBox(height: 14),
                      Text(
                        l10n.welcomeBody,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: 34),
                      const _Benefit(
                        icon: Icons.groups_2_outlined,
                        title: 'Épargnez en groupe',
                      ),
                      const _Benefit(
                        icon: Icons.shield_outlined,
                        title: 'Suivez chaque cotisation',
                      ),
                      const _Benefit(
                        icon: Icons.insights_outlined,
                        title: 'Construisez vos projets ensemble',
                      ),
                    ],
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: KombeSpacing.screen,
              ),
              child: Column(
                children: <Widget>[
                  FilledButton(
                    onPressed: () => context.go('/login'),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: <Widget>[
                        Text(l10n.signIn),
                        const SizedBox(width: 12),
                        const Icon(Icons.arrow_forward),
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
            const SizedBox(height: 16),
            const AfricanPatternBand(height: 42),
          ],
        ),
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
    padding: const EdgeInsets.only(bottom: 18),
    child: Row(
      children: <Widget>[
        CircleAvatar(
          radius: 25,
          backgroundColor: KombeColors.gold.withValues(alpha: .12),
          foregroundColor: KombeColors.goldDark,
          child: Icon(icon),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(title, style: Theme.of(context).textTheme.titleMedium),
        ),
      ],
    ),
  );
}
