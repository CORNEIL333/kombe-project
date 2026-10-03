import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/dispute.dart';
import '../../domain/repositories/dispute_repository.dart';

class DisputesScreen extends StatefulWidget {
  const DisputesScreen({super.key});

  @override
  State<DisputesScreen> createState() => _DisputesScreenState();
}

class _DisputesScreenState extends State<DisputesScreen> {
  Resource<List<DisputeSummary>> _state =
      const ResourceLoading<List<DisputeSummary>>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<DisputeSummary>> state =
        await context.read<DisputeRepository>().listDisputes();
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: const Text('Litiges'),
          actions: <Widget>[
            IconButton(
              tooltip: 'Ouvrir un litige',
              onPressed: () => context.push('/app/disputes/new'),
              icon: const Icon(Icons.add),
            ),
          ],
        ),
        body: ResourceView<List<DisputeSummary>>(
          resource: _state,
          emptyWhen: (List<DisputeSummary> items) => items.isEmpty,
          builder: (BuildContext context, List<DisputeSummary> items) {
            final String locale = Localizations.localeOf(context).toLanguageTag();
            return ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: items.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (BuildContext context, int index) {
                final DisputeSummary item = items[index];
                return SectionCard(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const CircleAvatar(
                      child: Icon(Icons.gavel_outlined),
                    ),
                    title: Text(item.subject),
                    subtitle: Text(
                      '${item.status.name} • ${DateFormat.yMMMd(locale).format(item.openedAtUtc.toLocal())}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/app/disputes/${item.id}'),
                  ),
                );
              },
            );
          },
        ),
      );
}

class CreateDisputeScreen extends StatefulWidget {
  const CreateDisputeScreen({super.key});

  @override
  State<CreateDisputeScreen> createState() => _CreateDisputeScreenState();
}

class _CreateDisputeScreenState extends State<CreateDisputeScreen> {
  final TextEditingController _groupId = TextEditingController();
  final TextEditingController _subject = TextEditingController();
  final TextEditingController _description = TextEditingController();
  final TextEditingController _operationId = TextEditingController();

  @override
  void dispose() {
    _groupId.dispose();
    _subject.dispose();
    _description.dispose();
    _operationId.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_groupId.text.trim().isEmpty ||
        _subject.text.trim().isEmpty ||
        _description.text.trim().isEmpty) {
      return;
    }
    final OperationResult<DisputeSummary> result =
        await context.read<DisputeRepository>().openDispute(
              groupId: _groupId.text.trim(),
              subject: _subject.text.trim(),
              description: _description.text.trim(),
              relatedOperationId: _operationId.text.trim().isEmpty
                  ? null
                  : _operationId.text.trim(),
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<DisputeSummary>(:final value):
        context.go('/app/disputes/${value.id}');
      case OperationBlocked<DisputeSummary>():
        await showServerAuthorityRequired(context);
      case OperationFailure<DisputeSummary>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString())),
        );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Ouvrir un litige')),
        body: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: <Widget>[
              const Text(
                'Le litige n’existe qu’après acceptation du serveur. Rien n’est ajouté au journal local.',
              ),
              const SizedBox(height: 20),
              TextField(
                controller: _groupId,
                decoration: const InputDecoration(labelText: 'Identifiant du groupe'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _subject,
                decoration: const InputDecoration(labelText: 'Objet'),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _operationId,
                decoration: const InputDecoration(
                  labelText: 'Opération concernée (optionnel)',
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _description,
                maxLines: 6,
                decoration: const InputDecoration(labelText: 'Description'),
              ),
              const SizedBox(height: 20),
              FilledButton(onPressed: _submit, child: const Text('Soumettre le litige')),
            ],
          ),
        ),
      );
}

class DisputeDetailScreen extends StatefulWidget {
  const DisputeDetailScreen({required this.disputeId, super.key});
  final String disputeId;

  @override
  State<DisputeDetailScreen> createState() => _DisputeDetailScreenState();
}

class _DisputeDetailScreenState extends State<DisputeDetailScreen> {
  Resource<DisputeDetails> _state = const ResourceLoading<DisputeDetails>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<DisputeDetails> state =
        await context.read<DisputeRepository>().getDispute(widget.disputeId);
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Détail du litige')),
        body: ResourceView<DisputeDetails>(
          resource: _state,
          builder: (BuildContext context, DisputeDetails dispute) {
            final String locale = Localizations.localeOf(context).toLanguageTag();
            return ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                Text(
                  dispute.summary.subject,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 8),
                Text(
                  dispute.summary.status.name,
                  style: Theme.of(context).textTheme.labelLarge,
                ),
                const SizedBox(height: 18),
                SectionCard(
                  child: Text(
                    dispute.description,
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                ),
                const SizedBox(height: 20),
                Text('Chronologie', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 8),
                for (final DisputeTimelineEntry entry in dispute.timeline)
                  ListTile(
                    leading: const Icon(Icons.circle_outlined, size: 18),
                    title: Text(entry.label),
                    subtitle: Text(
                      DateFormat.yMMMd(locale).add_Hm().format(entry.atUtc.toLocal()),
                    ),
                  ),
              ],
            );
          },
        ),
      );
}
