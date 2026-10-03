import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/repositories/group_repository.dart';
import '../../l10n/app_localizations.dart';

class JoinGroupScreen extends StatefulWidget {
  const JoinGroupScreen({super.key});

  @override
  State<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends State<JoinGroupScreen> {
  final TextEditingController _code = TextEditingController();

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _join() async {
    final String code = _code.text.trim();
    if (code.isEmpty) return;
    final OperationResult<void> result =
        await context.read<GroupRepository>().joinGroup(code);
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
        appBar: AppBar(title: Text(AppLocalizations.of(context).joinGroup)),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              Text('Code d’invitation', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 8),
              const Text(
                'Le code sera vérifié côté serveur. Aucun groupe n’est créé localement.',
              ),
              const SizedBox(height: 22),
              TextField(
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(
                  labelText: 'Code',
                  prefixIcon: Icon(Icons.key_outlined),
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(onPressed: _join, child: const Text('Vérifier et rejoindre')),
            ],
          ),
        ),
      );
}
