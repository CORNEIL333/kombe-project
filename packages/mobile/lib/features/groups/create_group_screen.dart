import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Écran de CRÉATION d'une tontine (C03 §2.1-2.3) — l'option qui manquait :
/// le parcours ne proposait que « rejoindre ». Ici le fondateur choisit un nom,
/// un modèle pré-rempli et une typologie de rotation ; la décision (devise,
/// fuseau, typologie P1 non démarrable) reste SERVEUR (0024, jamais contournée
/// par la seule UI).
class CreateGroupScreen extends StatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  State<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends State<CreateGroupScreen> {
  final GlobalKey<FormState> _form = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _parent = TextEditingController();
  String _model = 'famille';
  String _rotation = 'rotative_fermee';
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _parent.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_form.currentState?.validate() ?? false) || _busy) return;
    setState(() => _busy = true);
    // Le `groupId` est une CLÉ MÉTIER fournie par le contrat d'API (body
    // obligatoire) ; ce n'est pas une identité (l'acteur, lui, est toujours
    // résolu serveur). On en génère un unique côté client.
    final String groupId = _generateGroupId();
    final OperationResult<String> result =
        await context.read<GroupRepository>().createGroup(
              groupId: groupId,
              displayName: _name.text.trim(),
              tontineModel: _model,
              rotationType: _rotation,
              parentGroupId: _parent.text.trim().isEmpty
                  ? null
                  : _parent.text.trim(),
            );
    if (!mounted) return;
    setState(() => _busy = false);
    switch (result) {
      case OperationSuccess<String>():
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Tontine créée. Vous pouvez y inviter ses membres.')),
        );
      case OperationBlocked<String>():
        await showServerAuthorityRequired(context);
      case OperationFailure<String>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Création refusée : ${_explain(error)}')),
        );
    }
  }

  static String _explain(Object error) {
    final String s = error.toString();
    if (s.contains('GROUP_PARENT_UNKNOWN')) return 'groupe parent introuvable.';
    if (s.contains('GROUP_PARENT_DEPTH_EXCEEDED')) return 'chaîne de supervision trop profonde.';
    if (s.contains('GROUP_TIMEZONE_UNSUPPORTED')) return 'fuseau non pris en charge au pilote.';
    if (s.contains('ROTATION_TYPE_UNKNOWN')) return 'typologie de rotation inconnue.';
    if (s.contains('TONTINE_MODEL_UNKNOWN')) return 'modèle de tontine inconnu.';
    if (s.contains('UNAUTHENTICATED') || s.contains('401')) return 'session requise (reconnectez-vous).';
    return 'la demande a été refusée par le serveur.';
  }

  static String _generateGroupId() {
    final int rand = math.Random.secure().nextInt(1 << 30);
    return 'grp-${DateTime.now().toUtc().microsecondsSinceEpoch}-$rand';
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Créer une tontine')),
      body: SafeArea(
        child: Form(
          key: _form,
          child: ListView(
            padding: const EdgeInsets.all(24),
            children: <Widget>[
              Text('Nom de la tontine', style: t.titleMedium),
              const SizedBox(height: 6),
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(hintText: 'Ex. Tontine des artisans'),
                validator: (String? v) =>
                    (v == null || v.trim().isEmpty) ? 'Le nom est requis.' : null,
              ),
              const SizedBox(height: 22),
              Text('Modèle de tontine', style: t.titleMedium),
              const SizedBox(height: 6),
              Text(
                'Pré-remplit des règles éditables (cadence, échéance, quorum). Le montant reste choisi plus tard.',
                style: t.bodySmall,
              ),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _model,
                items: <DropdownMenuItem<String>>[
                  for (final String m in tontineModels)
                    DropdownMenuItem<String>(value: m, child: Text(tontineModelLabel(m))),
                ],
                onChanged: (String? v) => setState(() => _model = v ?? _model),
              ),
              const SizedBox(height: 22),
              Text('Typologie de rotation', style: t.titleMedium),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                initialValue: _rotation,
                items: <DropdownMenuItem<String>>[
                  for (final String r in rotationTypes)
                    DropdownMenuItem<String>(value: r, child: Text(rotationTypeLabel(r))),
                ],
                onChanged: (String? v) => setState(() => _rotation = v ?? _rotation),
              ),
              if (_rotation != 'rotative_fermee')
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Typologie reconnue mais non encore démarrable au pilote (recette dédiée à venir).',
                    style: t.bodySmall?.copyWith(color: Colors.orange.shade800),
                  ),
                ),
              const SizedBox(height: 22),
              Text('Groupe parent de supervision (facultatif)', style: t.titleMedium),
              const SizedBox(height: 6),
              Text(
                'Une association faîtière peut superviser plusieurs tontines. La supervision ne donne aucun droit financier.',
                style: t.bodySmall,
              ),
              const SizedBox(height: 10),
              TextFormField(
                controller: _parent,
                decoration: const InputDecoration(hintText: 'Identifiant du groupe parent'),
              ),
              const SizedBox(height: 26),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Créer la tontine'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
