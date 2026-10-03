import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/auth_repository.dart';
import 'auth_validators.dart';

class CreatePinScreen extends StatefulWidget {
  const CreatePinScreen({super.key});

  @override
  State<CreatePinScreen> createState() => _CreatePinScreenState();
}

class _CreatePinScreenState extends State<CreatePinScreen> {
  final TextEditingController _pin = TextEditingController();
  final TextEditingController _confirm = TextEditingController();

  @override
  void dispose() {
    _pin.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!AuthValidators.isPin(_pin.text) || _pin.text != _confirm.text) return;
    final OperationResult<void> result =
        await context.read<AuthRepository>().setPin(_pin.text);
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        context.go('/biometric-setup');
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Créer votre code PIN')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              Text('Sécurisez votre accès', style: Theme.of(context).textTheme.headlineLarge),
              const SizedBox(height: 10),
              Text(
                'Le PIN est enregistré uniquement par le service d’identité. Le client ne conserve pas votre PIN en clair.',
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              const SizedBox(height: 24),
              TextField(
                controller: _pin,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 4,
                decoration: const InputDecoration(labelText: 'Nouveau PIN', counterText: ''),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _confirm,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 4,
                decoration: const InputDecoration(labelText: 'Confirmer le PIN', counterText: ''),
              ),
              const SizedBox(height: 20),
              FilledButton(onPressed: _save, child: const Text('Enregistrer')),
            ],
          ),
        ),
      );
}
