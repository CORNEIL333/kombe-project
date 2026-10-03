import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/auth_repository.dart';
import 'auth_validators.dart';

class RecoverPinScreen extends StatefulWidget {
  const RecoverPinScreen({super.key});

  @override
  State<RecoverPinScreen> createState() => _RecoverPinScreenState();
}

class _RecoverPinScreenState extends State<RecoverPinScreen> {
  final TextEditingController _phone = TextEditingController();

  @override
  void dispose() {
    _phone.dispose();
    super.dispose();
  }

  Future<void> _request() async {
    if (!AuthValidators.isCameroonLocalPhone(_phone.text)) return;
    final OperationResult<void> result =
        await context.read<AuthRepository>().requestPinRecovery(
              '+237${_phone.text.replaceAll(RegExp(r'\s+'), '')}',
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        context.go('/recovery-verify');
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Récupération du PIN')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              Text('Récupérer l’accès', style: Theme.of(context).textTheme.headlineLarge),
              const SizedBox(height: 10),
              const Text('La récupération est contrôlée par le serveur et n’est jamais simulée localement.'),
              const SizedBox(height: 24),
              TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(labelText: 'Téléphone', prefixText: '+237  '),
              ),
              const SizedBox(height: 20),
              FilledButton(onPressed: _request, child: const Text('Demander un code')),
            ],
          ),
        ),
      );
}
