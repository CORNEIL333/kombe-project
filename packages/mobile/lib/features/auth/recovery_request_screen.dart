import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../l10n/app_localizations.dart';
import 'code_request_form.dart';
import 'verify_code_screen.dart';

/// Accès perdu : il suffit de redemander un code à la même adresse (ou au
/// même numéro). Le code vérifié rouvre directement la session.
class RecoveryRequestScreen extends StatelessWidget {
  const RecoveryRequestScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.recoverAccount),
        leading: BackButton(onPressed: () => context.go('/login')),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            Text(l10n.recoverAccount, style: Theme.of(context).textTheme.headlineLarge),
            const SizedBox(height: 10),
            Text(l10n.recoverAccountIntro, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 24),
            const CodeRequestForm(purpose: VerifyCodePurpose.recovery, submitLabel: 'Recevoir un nouveau code'),
          ],
        ),
      ),
    );
  }
}
