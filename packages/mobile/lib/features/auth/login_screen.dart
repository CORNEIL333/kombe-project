import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/kombe_orbit_band.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../l10n/app_localizations.dart';
import 'code_request_form.dart';
import 'verify_code_screen.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: <Widget>[
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 16),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      IconButton(
                        tooltip: l10n.back,
                        onPressed: () => context.go('/'),
                        icon: const Icon(Icons.arrow_back_ios_new),
                      ),
                      const SizedBox(height: 18),
                      const Center(child: KombeLogo(size: 60)),
                      const SizedBox(height: 36),
                      Text(
                        'Connexion',
                        style: Theme.of(context).textTheme.displaySmall?.copyWith(color: KombeColors.ink),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Indiquez où recevoir votre code : vous retrouvez vos groupes juste après.',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: KombeColors.slate),
                      ),
                      const SizedBox(height: 28),
                      const CodeRequestForm(purpose: VerifyCodePurpose.login, submitLabel: 'Recevoir mon code'),
                      const SizedBox(height: 10),
                      Center(
                        child: TextButton(
                          onPressed: () => context.go('/register'),
                          child: const Text('Première fois ? Votre premier code crée votre compte.', textAlign: TextAlign.center),
                        ),
                      ),
                      Center(
                        child: TextButton(
                          onPressed: () => context.go('/recovery-request'),
                          child: Text(l10n.forgotCode, textAlign: TextAlign.center),
                        ),
                      ),
                      const SizedBox(height: 18),
                      // Note exacte (pas de promesse de chiffrement non garantie).
                      Container(
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(16)),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            const Icon(Icons.verified_user_outlined, color: KombeColors.forest, size: 28),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: <Widget>[
                                  Text('Connexion sans mot de passe', style: Theme.of(context).textTheme.titleSmall?.copyWith(color: KombeColors.forest)),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Un code à 6 chiffres vous est envoyé à chaque connexion. Il n’est valable qu’une fois et pendant 10 minutes.',
                                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: KombeColors.ink),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
              ),
            ),
            const KombeOrbitBand(height: 42),
          ],
        ),
      ),
    );
  }
}
