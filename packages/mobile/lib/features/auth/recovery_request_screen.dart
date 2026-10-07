import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';
import 'auth_validators.dart';
import 'verify_code_screen.dart';

/// Demande de récupération par email (ADR-0024) — remplace l'ancienne
/// récupération de PIN par téléphone. La récupération ne délivre PAS de
/// session (voir `AuthRepository.completeRecovery`) : une connexion normale
/// reste nécessaire ensuite, jamais une session fabriquée ici.
class RecoveryRequestScreen extends StatefulWidget {
  const RecoveryRequestScreen({super.key});

  @override
  State<RecoveryRequestScreen> createState() => _RecoveryRequestScreenState();
}

class _RecoveryRequestScreenState extends State<RecoveryRequestScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _email = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _request() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() => _submitting = true);
    final OperationResult<void> result = await context
        .read<AuthRepository>()
        .requestRecovery(_email.text.trim());
    if (!mounted) return;
    setState(() => _submitting = false);
    switch (result) {
      case OperationSuccess<void>():
        context.go(
          VerifyCodeScreen.routeFor(
            purpose: VerifyCodePurpose.recovery,
            identityId: _email.text.trim(),
          ),
        );
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.recoverAccount)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            Text(
              l10n.recoverAccount,
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 10),
            Text(
              l10n.recoverAccountIntro,
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 24),
            Form(
              key: _formKey,
              child: TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const <String>[AutofillHints.email],
                decoration: InputDecoration(labelText: l10n.email),
                validator: (String? value) =>
                    AuthValidators.isEmail(value ?? '')
                    ? null
                    : l10n.invalidEmail,
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _submitting ? null : _request,
              child: _submitting
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(l10n.sendCode),
            ),
          ],
        ),
      ),
    );
  }
}
