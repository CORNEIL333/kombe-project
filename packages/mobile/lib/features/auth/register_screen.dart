import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/kombe_logo.dart';
import '../../l10n/app_localizations.dart';
import 'code_request_form.dart';
import 'verify_code_screen.dart';

/// Création de compte : même geste que la connexion côté serveur — le premier
/// code vérifié crée le compte et ouvre la session.
class RegisterScreen extends StatelessWidget {
  const RegisterScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(leading: BackButton(onPressed: () => context.go('/'))),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            const Center(child: KombeLogo(size: 48)),
            const SizedBox(height: 36),
            Text(l10n.createAccount, style: Theme.of(context).textTheme.headlineLarge),
            const SizedBox(height: 10),
            Text(l10n.registerIntro, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 28),
            const CodeRequestForm(purpose: VerifyCodePurpose.registration, submitLabel: 'Recevoir mon code'),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: () => context.go('/login'),
                child: const Text('Déjà un compte ? Se connecter'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
