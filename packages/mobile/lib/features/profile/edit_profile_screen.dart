import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../domain/entities/profile.dart';
import '../../domain/repositories/profile_repository.dart';

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final TextEditingController _name = TextEditingController();
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _prefill();
  }

  Future<void> _prefill() async {
    final Resource<UserProfile> p = await context.read<ProfileRepository>().loadProfile();
    if (!mounted) return;
    if (p case ResourceReady<UserProfile>(:final UserProfile data) when _name.text.isEmpty) {
      _name.text = data.displayName;
    }
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final String name = _name.text.trim();
    if (name.length < 2) {
      showKombeMessage(context, 'Indiquez au moins 2 caractères.');
      return;
    }
    setState(() => _saving = true);
    final OperationResult<UserProfile> result = await context.read<ProfileRepository>().updateProfile(
          displayName: name,
          localeCode: Localizations.localeOf(context).languageCode,
        );
    if (!mounted) return;
    setState(() => _saving = false);
    if (reportOutcome(context, result)) Navigator.of(context).pop();
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
                maxLength: 80,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Nom affiché',
                  helperText: 'C’est le nom que les membres de vos groupes voient.',
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Enregistrer'),
              ),
            ],
          ),
        ),
      );
}
