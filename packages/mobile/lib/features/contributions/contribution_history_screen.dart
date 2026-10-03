import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/xaf.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/draft_repository.dart';

class ContributionHistoryScreen extends StatefulWidget {
  const ContributionHistoryScreen({super.key});

  @override
  State<ContributionHistoryScreen> createState() => _ContributionHistoryScreenState();
}

class _ContributionHistoryScreenState extends State<ContributionHistoryScreen> {
  Resource<List<Contribution>> _remote = const ResourceLoading<List<Contribution>>();
  List<ContributionDraft> _drafts = const <ContributionDraft>[];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<Contribution>> remote =
        await context.read<ContributionRepository>().listHistory();
    final List<ContributionDraft> drafts =
        await context.read<ContributionDraftRepository>().listDrafts();
    if (mounted) {
      setState(() {
        _remote = remote;
        _drafts = drafts;
      });
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Historique des cotisations')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: <Widget>[
              if (_drafts.isNotEmpty) ...<Widget>[
                Text('Brouillons locaux', style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 10),
                for (final ContributionDraft draft in _drafts)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const CircleAvatar(child: Icon(Icons.edit_note)),
                    title: Text(Xaf.format(draft.amountXaf)),
                    subtitle: const Text('Non soumis au serveur'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push(
                      '/app/groups/${draft.groupId}/contributions/new?draft=${draft.localId}',
                    ),
                  ),
                const SizedBox(height: 22),
              ],
              Text('Historique serveur', style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 10),
              ResourceView<List<Contribution>>(
                resource: _remote,
                emptyWhen: (List<Contribution> data) => data.isEmpty,
                builder: (BuildContext context, List<Contribution> contributions) => Column(
                  children: <Widget>[
                    for (final Contribution contribution in contributions)
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(Xaf.format(contribution.amountXaf)),
                        subtitle: Text(contribution.status.name),
                        trailing: const Icon(Icons.chevron_right),
                        onTap: () => context.push(
                          '/app/contributions/${contribution.id}',
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}
