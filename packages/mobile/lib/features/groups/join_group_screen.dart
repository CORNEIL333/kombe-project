import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_theme.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/kombe_components.dart';
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
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _join() async {
    final String code = _code.text.trim();
    if (_sending) return;
    if (code.isEmpty) {
      setState(() => _error = AppLocalizations.of(context).jgSaisissezLeCodeRecuDu);
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    final OperationResult<void> result = await context.read<GroupRepository>().joinGroup(code);
    if (!mounted) return;
    final String? problem = outcomeMessage(result);
    setState(() {
      _sending = false;
      _error = problem;
    });
    if (problem == null) {
      showKombeMessage(
        context,
        AppLocalizations.of(context).jgDemandeEnvoyeeLePresidentOu,
      );
      Navigator.of(context).pop();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).joinGroup)),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 12, 24, 24),
            children: <Widget>[
              KombeFormHeader(
                icon: Icons.key_outlined,
                tone: KombeTone.money,
                title: AppLocalizations.of(context).jgCodeDinvitation,
                body: AppLocalizations.of(context).jgSaisissezLeCodeDeCaracteres,
              ),
              TextField(
                controller: _code,
                enabled: !_sending,
                textCapitalization: TextCapitalization.characters,
                autocorrect: false,
                textAlign: TextAlign.center,
                textInputAction: TextInputAction.go,
                onSubmitted: (_) => _join(),
                style: KombeType.amount(size: 26),
                decoration: InputDecoration(labelText: AppLocalizations.of(context).inCode, hintText: AppLocalizations.of(context).jgExK7p2mnqx),
              ),
              if (_error != null) ...<Widget>[const SizedBox(height: 12), KombeInlineError(_error!)],
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _sending ? null : _join,
                child: _sending
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                    : Text(AppLocalizations.of(context).jgDemanderRejoindre),
              ),
            ],
          ),
        ),
      );
}
