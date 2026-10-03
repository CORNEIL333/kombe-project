import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/entities/profile.dart';
import '../../domain/repositories/profile_repository.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final TextEditingController _name = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) return;
    final OperationResult<UserProfile> result =
        await context.read<ProfileRepository>().updateProfile(
              displayName: _name.text.trim(),
              localeCode: Localizations.localeOf(context).languageCode,
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<UserProfile>():
        Navigator.of(context).pop();
      case OperationBlocked<UserProfile>():
        await showServerAuthorityRequired(context);
      case OperationFailure<UserProfile>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(error.toString())));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Modifier le profil')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: <Widget>[
              TextField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Nom affiché'),
              ),
              const SizedBox(height: 20),
              FilledButton(onPressed: _save, child: const Text('Enregistrer')),
            ],
          ),
        ),
      );
}
