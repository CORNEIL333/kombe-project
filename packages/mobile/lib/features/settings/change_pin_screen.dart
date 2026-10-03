import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/profile_repository.dart';
import '../auth/auth_validators.dart';

class ChangePinScreen extends StatefulWidget {
  const ChangePinScreen({super.key});

  @override
  State<ChangePinScreen> createState() => _ChangePinScreenState();
}

class _ChangePinScreenState extends State<ChangePinScreen> {
  final TextEditingController _current = TextEditingController();
  final TextEditingController _next = TextEditingController();
  final TextEditingController _confirm = TextEditingController();

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!AuthValidators.isPin(_current.text) ||
        !AuthValidators.isPin(_next.text) ||
        _next.text != _confirm.text) {
      return;
    }
    final OperationResult<void> result =
        await context.read<ProfileRepository>().changePin(
              currentPin: _current.text,
              newPin: _next.text,
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        Navigator.of(context).pop();
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Modifier le code PIN')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: <Widget>[
              TextField(
                controller: _current,
                obscureText: true,
                keyboardType: TextInputType.number,
                maxLength: 4,
                decoration: const InputDecoration(labelText: 'PIN actuel', counterText: ''),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _next,
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
                decoration: const InputDecoration(labelText: 'Confirmer', counterText: ''),
              ),
              const SizedBox(height: 20),
              FilledButton(onPressed: _save, child: const Text('Modifier')),
            ],
          ),
        ),
      );
}
