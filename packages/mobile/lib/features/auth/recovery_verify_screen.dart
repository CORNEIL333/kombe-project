import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/auth_repository.dart';
import 'auth_validators.dart';

class RecoveryVerifyScreen extends StatefulWidget {
  const RecoveryVerifyScreen({super.key});

  @override
  State<RecoveryVerifyScreen> createState() => _RecoveryVerifyScreenState();
}

class _RecoveryVerifyScreenState extends State<RecoveryVerifyScreen> {
  final TextEditingController _code = TextEditingController();
  final TextEditingController _pin = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    _pin.dispose();
    super.dispose();
  }

  Future<void> _complete() async {
    if (!AuthValidators.isChallengeCode(_code.text) || !AuthValidators.isPin(_pin.text)) return;
    final OperationResult<void> result =
        await context.read<AuthRepository>().completePinRecovery(
              challengeCode: _code.text,
              newPin: _pin.text,
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        context.go('/login');
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Vérifier la récupération')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              const Text('Code de récupération'),
              const SizedBox(height: 8),
              TextField(controller: _code, keyboardType: TextInputType.number),
              const SizedBox(height: 18),
              const Text('Nouveau PIN'),
              const SizedBox(height: 8),
              TextField(controller: _pin, keyboardType: TextInputType.number, obscureText: true, maxLength: 4),
              const SizedBox(height: 20),
              FilledButton(onPressed: _complete, child: const Text('Mettre à jour le PIN')),
            ],
          ),
        ),
      );
}
