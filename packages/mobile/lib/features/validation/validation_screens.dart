import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/xaf.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/governance.dart';
import '../../domain/repositories/governance_repository.dart';

class ValidationQueueScreen extends StatefulWidget {
  const ValidationQueueScreen({super.key});

  @override
  State<ValidationQueueScreen> createState() => _ValidationQueueScreenState();
}

class _ValidationQueueScreenState extends State<ValidationQueueScreen> {
  Resource<List<ValidationItem>> _state =
      const ResourceLoading<List<ValidationItem>>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<ValidationItem>> state =
        await context.read<GovernanceRepository>().listPendingValidations();
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Validations')),
        body: ResourceView<List<ValidationItem>>(
          resource: _state,
          emptyWhen: (List<ValidationItem> data) => data.isEmpty,
          builder: (BuildContext context, List<ValidationItem> data) =>
              ListView.separated(
            padding: const EdgeInsets.all(20),
            itemCount: data.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (BuildContext context, int index) {
              final ValidationItem item = data[index];
              return SectionCard(
                child: ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const CircleAvatar(child: Icon(Icons.fact_check_outlined)),
                  title: Text(item.memberDisplayName),
                  subtitle: Text(Xaf.format(item.amountXaf)),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push(
                    '/app/validations/${item.contributionId}',
                  ),
                ),
              );
            },
          ),
        ),
      );
}

class ValidationDetailScreen extends StatefulWidget {
  const ValidationDetailScreen({
    required this.contributionId,
    super.key,
  });

  final String contributionId;

  @override
  State<ValidationDetailScreen> createState() => _ValidationDetailScreenState();
}

class _ValidationDetailScreenState extends State<ValidationDetailScreen> {
  Resource<ValidationItem> _state = const ResourceLoading<ValidationItem>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<ValidationItem> state =
        await context.read<GovernanceRepository>().getValidation(
              widget.contributionId,
            );
    if (mounted) setState(() => _state = state);
  }

  Future<void> _decide(
    ValidationItem item,
    ValidationDecision decision,
  ) async {
    final OperationResult<void> result =
        await context.read<GovernanceRepository>().decideValidation(
              contributionId: item.contributionId,
              expectedVersion: item.version,
              decision: decision,
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        // Confirmé par le serveur uniquement : retour haptique et message proportionnés.
        unawaited(HapticFeedback.mediumImpact());
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Décision enregistrée dans l’historique du groupe.')),
        );
        await _load();
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        unawaited(HapticFeedback.heavyImpact());
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString())),
        );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Validation de cotisation')),
        body: ResourceView<ValidationItem>(
          resource: _state,
          builder: (BuildContext context, ValidationItem item) => ListView(
            padding: const EdgeInsets.all(20),
            children: <Widget>[
              SectionCard(
                child: Column(
                  children: <Widget>[
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: const CircleAvatar(
                        child: Icon(Icons.person_outline),
                      ),
                      title: Text(item.memberDisplayName),
                      subtitle: const Text('Déclaration soumise'),
                    ),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Montant déclaré'),
                      trailing: Text(
                        Xaf.format(item.amountXaf),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Justificatif'),
                      trailing: Text(item.evidenceName ?? 'Non fourni'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 22),
              Text('Votre décision', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => _decide(item, ValidationDecision.validate),
                icon: const Icon(Icons.check_circle_outline),
                label: const Text('Valider la cotisation'),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => _decide(item, ValidationDecision.reject),
                icon: const Icon(Icons.cancel_outlined),
                label: const Text('Rejeter la cotisation'),
              ),
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: () => _decide(
                  item,
                  ValidationDecision.requestInformation,
                ),
                icon: const Icon(Icons.help_outline),
                label: const Text('Demander plus d’informations'),
              ),
              const SizedBox(height: 18),
              const Text(
                'Aucune décision n’est enregistrée localement. La décision n’existe qu’après acceptation du serveur.',
              ),
            ],
          ),
        ),
      );
}
