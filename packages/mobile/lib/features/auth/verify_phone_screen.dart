import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../l10n/app_localizations.dart';
import 'auth_validators.dart';

class VerifyPhoneScreen extends StatefulWidget {
  const VerifyPhoneScreen({super.key});

  @override
  State<VerifyPhoneScreen> createState() => _VerifyPhoneScreenState();
}

class _VerifyPhoneScreenState extends State<VerifyPhoneScreen> {
  final TextEditingController _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _verify() async {
    if (!AuthValidators.isChallengeCode(_code.text)) return;
    final OperationResult<void> result =
        await context.read<AuthRepository>().verifyPhone(challengeCode: _code.text);
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        context.go('/create-pin');
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Vérification')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              Text(
                'Vérifiez votre numéro',
                style: Theme.of(context).textTheme.headlineLarge,
              ),
              const SizedBox(height: 10),
              Text(
                'Saisissez le code reçu. Le client mobile ne génère jamais de code localement.',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 26),
              TextField(
                controller: _code,
                keyboardType: TextInputType.number,
                autofillHints: const <String>[AutofillHints.oneTimeCode],
                decoration: const InputDecoration(labelText: 'Code de vérification'),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _verify,
                child: Text(AppLocalizations.of(context).confirm),
              ),
            ],
          ),
        ),
      );
}
