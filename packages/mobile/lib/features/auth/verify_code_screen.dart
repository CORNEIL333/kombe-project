import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';
import 'auth_validators.dart';

/// Les TROIS finalités (ADR-0024) partagent le même mécanisme code+hash :
/// un seul écran de saisie de code, paramétré par la finalité — jamais trois
/// copies quasi identiques du même formulaire.
enum VerifyCodePurpose { registration, login, recovery }

class VerifyCodeScreen extends StatefulWidget {
  const VerifyCodeScreen({
    super.key,
    required this.purpose,
    required this.identityId,
  });

  final VerifyCodePurpose purpose;
  final String identityId;

  /// Construit l'URL de route pour cette finalité — `identityId` (une adresse
  /// email) est encodé via `Uri` plutôt que par concaténation manuelle.
  static String routeFor({
    required VerifyCodePurpose purpose,
    required String identityId,
  }) => Uri(
    path: '/verify-code',
    queryParameters: <String, String>{
      'purpose': purpose.name,
      'identityId': identityId,
    },
  ).toString();

  @override
  State<VerifyCodeScreen> createState() => _VerifyCodeScreenState();
}

class _VerifyCodeScreenState extends State<VerifyCodeScreen> {
  final TextEditingController _code = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (!AuthValidators.isChallengeCode(_code.text)) return;
    setState(() => _submitting = true);
    final AuthRepository repo = context.read<AuthRepository>();
    final OperationResult<Object?> result = switch (widget.purpose) {
      VerifyCodePurpose.registration => await repo.verifyRegistration(
        identityId: widget.identityId,
        code: _code.text,
      ),
      VerifyCodePurpose.login => await repo.completeLogin(
        identityId: widget.identityId,
        code: _code.text,
      ),
      VerifyCodePurpose.recovery => await repo.completeRecovery(
        identityId: widget.identityId,
        code: _code.text,
      ),
    };
    if (!mounted) return;
    setState(() => _submitting = false);
    switch (result) {
      case OperationSuccess<Object?>():
        _onVerified();
      case OperationBlocked<Object?>():
        await showServerAuthorityRequired(context);
      case OperationFailure<Object?>(:final error):
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  void _onVerified() {
    switch (widget.purpose) {
      case VerifyCodePurpose.registration:
        // Inscription achevée ≠ session ouverte (ADR-0024) : une connexion
        // normale reste nécessaire, jamais une session fabriquée ici.
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).accountActivated),
          ),
        );
        context.go('/login');
      case VerifyCodePurpose.login:
        // La session est déjà posée par le dépôt (watchSession) : le routeur
        // redirige automatiquement vers /app (voir AppRouter._redirect).
        context.go('/app');
      case VerifyCodePurpose.recovery:
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppLocalizations.of(context).recoveryComplete),
          ),
        );
        context.go('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(l10n.verifyCodeTitle)),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            Text(
              l10n.verifyCodeTitle,
              style: Theme.of(context).textTheme.headlineLarge,
            ),
            const SizedBox(height: 10),
            Text(l10n.codeSent, style: Theme.of(context).textTheme.bodyLarge),
            const SizedBox(height: 26),
            TextField(
              controller: _code,
              keyboardType: TextInputType.number,
              autofillHints: const <String>[AutofillHints.oneTimeCode],
              decoration: InputDecoration(labelText: l10n.code),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _submitting ? null : _verify,
              child: _submitting
                  ? const SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : Text(l10n.confirm),
            ),
          ],
        ),
      ),
    );
  }
}
