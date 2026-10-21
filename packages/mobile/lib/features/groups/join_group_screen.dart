import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../domain/repositories/group_repository.dart';
import '../../l10n/app_localizations.dart';

class JoinGroupScreen extends StatefulWidget {
  const JoinGroupScreen({super.key});

  @override
  State<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends State<JoinGroupScreen> {
  final TextEditingController _code = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _join() async {
    final String code = _code.text.trim();
    if (code.isEmpty || _busy) return;
    setState(() => _busy = true);
    final OperationResult<void> result = await context.read<GroupRepository>().joinGroup(code);
    if (!mounted) return;
    setState(() => _busy = false);
    if (reportOutcome(context, result)) {
      showKombeMessage(
        context,
        'Demande envoyée. Le président ou le vice-président doit vous admettre ; vous serez prévenu dans vos notifications.',
      );
      Navigator.of(context).pop();
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
                'Saisissez le code de 8 caractères reçu du bureau du groupe (ou ouvrez le lien d’invitation). '
                'Votre demande est ensuite examinée par le président ou le vice-président.',
              ),
              const SizedBox(height: 22),
              TextField(
                controller: _code,
                textCapitalization: TextCapitalization.characters,
                autocorrect: false,
                onSubmitted: (_) => _join(),
                decoration: const InputDecoration(
                  labelText: 'Code',
                  hintText: 'Ex. K7P2MNQX',
                  prefixIcon: Icon(Icons.key_outlined),
                ),
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _join,
                child: _busy
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Demander à rejoindre'),
              ),
            ],
          ),
        ),
      );
}
