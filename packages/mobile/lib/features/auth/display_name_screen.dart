import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/session_controller.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../domain/entities/profile.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/repositories/profile_repository.dart';

/// Première entrée d'un compte sans nom : « Comment vous appelle-t-on ? ».
/// Le nom est enregistré par le serveur (`PATCH /v1/me {displayName}`) ; c'est
/// lui que les membres verront quand vous créez ou rejoignez un groupe.
class DisplayNameScreen extends StatefulWidget {
  const DisplayNameScreen({super.key});

  @override
  State<DisplayNameScreen> createState() => _DisplayNameScreenState();
}

class _DisplayNameScreenState extends State<DisplayNameScreen> {
  final GlobalKey<FormState> _form = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  bool _saving = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!(_form.currentState?.validate() ?? false) || _saving) return;
    setState(() => _saving = true);
    final SessionController session = context.read<SessionController>();
    final OperationResult<UserProfile> r = await context.read<ProfileRepository>().updateProfile(
          displayName: _name.text.trim().replaceAll(RegExp(r'\s+'), ' '),
          localeCode: Localizations.localeOf(context).languageCode,
        );
    if (!mounted) return;
    setState(() => _saving = false);
    if (reportOutcome(context, r)) session.displayNameSaved();
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              const SizedBox(height: 24),
              const Center(child: KombeLogo(size: 52)),
              const SizedBox(height: 36),
              Text('Comment vous appelle-t-on ?', style: t.headlineLarge),
              const SizedBox(height: 10),
              Text(
                'C’est le nom que les membres de vos groupes verront (ex. Awa Mballa). Vous pourrez le modifier dans « Mon profil ».',
                style: t.bodyLarge,
              ),
              const SizedBox(height: 24),
              TextFormField(
                controller: _name,
                autofocus: true,
                textCapitalization: TextCapitalization.words,
                maxLength: 80,
                textInputAction: TextInputAction.done,
                onFieldSubmitted: (_) => _save(),
                decoration: const InputDecoration(labelText: 'Prénom et nom'),
                validator: (String? v) => (v ?? '').trim().length < 2 ? 'Indiquez au moins 2 caractères.' : null,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _saving ? null : _save,
                child: _saving
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Continuer'),
              ),
              const SizedBox(height: 12),
              Center(
                child: TextButton(
                  onPressed: _saving ? null : () => context.read<AuthRepository>().signOut(),
                  child: const Text('Se déconnecter'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
