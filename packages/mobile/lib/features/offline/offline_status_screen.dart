import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/offline/offline_policy.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/draft_repository.dart';

class OfflineStatusScreen extends StatefulWidget {
  const OfflineStatusScreen({super.key});

  @override
  State<OfflineStatusScreen> createState() => _OfflineStatusScreenState();
}

class _OfflineStatusScreenState extends State<OfflineStatusScreen> {
  List<ContributionDraft> _drafts = const <ContributionDraft>[];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final List<ContributionDraft> drafts =
        await context.read<ContributionDraftRepository>().listDrafts();
    if (mounted) setState(() => _drafts = drafts);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('État hors connexion')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            SectionCard(
              child: Column(
                children: <Widget>[
                  const ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.edit_note_outlined),
                    title: Text('Brouillons locaux'),
                    subtitle: Text(
                      'Autorisés. Ils ne deviennent jamais des opérations officielles sans serveur.',
                    ),
                  ),
                  const Divider(),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const Icon(Icons.storage_outlined),
                    title: const Text('Brouillons présents'),
                    trailing: Text('${_drafts.length}'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 14),
            SectionCard(
              child: Column(
                children: <Widget>[
                  _CapabilityRow(
                    label: 'Validation d’une cotisation',
                    allowed: OfflinePolicy.isAllowed(
                      OfflineCapability.validateContribution,
                    ),
                  ),
                  const Divider(),
                  _CapabilityRow(
                    label: 'Vote',
                    allowed: OfflinePolicy.isAllowed(OfflineCapability.vote),
                  ),
                  const Divider(),
                  _CapabilityRow(
                    label: 'Changement de rôle',
                    allowed: OfflinePolicy.isAllowed(
                      OfflineCapability.changeRole,
                    ),
                  ),
                  const Divider(),
                  _CapabilityRow(
                    label: 'Publication des règles',
                    allowed: OfflinePolicy.isAllowed(
                      OfflineCapability.publishRules,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class _CapabilityRow extends StatelessWidget {
  const _CapabilityRow({required this.label, required this.allowed});

  final String label;
  final bool allowed;

  @override
  Widget build(BuildContext context) => ListTile(
        contentPadding: EdgeInsets.zero,
        title: Text(label),
        trailing: Icon(
          allowed ? Icons.check_circle : Icons.block,
          color: allowed ? Colors.green : Colors.red,
        ),
      );
}
