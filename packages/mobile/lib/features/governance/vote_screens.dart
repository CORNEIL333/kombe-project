import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/server_action_guard.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/governance.dart';
import '../../domain/repositories/governance_repository.dart';

class VotesScreen extends StatefulWidget {
  const VotesScreen({super.key});

  @override
  State<VotesScreen> createState() => _VotesScreenState();
}

class _VotesScreenState extends State<VotesScreen> {
  Resource<List<VoteSummary>> _state = const ResourceLoading<List<VoteSummary>>();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<VoteSummary>> state =
        await context.read<GovernanceRepository>().listVotes();
    if (mounted) setState(() => _state = state);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Votes et décisions')),
        body: ResourceView<List<VoteSummary>>(
          resource: _state,
          emptyWhen: (List<VoteSummary> votes) => votes.isEmpty,
          builder: (BuildContext context, List<VoteSummary> votes) {
            final String locale =
                Localizations.localeOf(context).toLanguageTag();
            return ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: votes.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (BuildContext context, int index) {
                final VoteSummary vote = votes[index];
                return SectionCard(
                  child: ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: const CircleAvatar(
                      child: Icon(Icons.how_to_vote_outlined),
                    ),
                    title: Text(vote.title),
                    subtitle: Text(
                      'Clôture : ${DateFormat.yMMMd(locale).add_Hm().format(vote.closesAtUtc.toLocal())}',
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () => context.push('/app/votes/${vote.id}'),
                  ),
                );
              },
            );
          },
        ),
      );
}

class VoteDetailScreen extends StatefulWidget {
  const VoteDetailScreen({required this.voteId, super.key});
  final String voteId;

  @override
  State<VoteDetailScreen> createState() => _VoteDetailScreenState();
}

class _VoteDetailScreenState extends State<VoteDetailScreen> {
  Resource<VoteDetails> _state = const ResourceLoading<VoteDetails>();
  VoteChoice? _choice;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  Future<void> _load() async {
    final Resource<VoteDetails> state =
        await context.read<GovernanceRepository>().getVote(widget.voteId);
    if (mounted) setState(() => _state = state);
  }

  Future<void> _submit() async {
    final VoteChoice? choice = _choice;
    if (choice == null) return;
    final OperationResult<void> result =
        await context.read<GovernanceRepository>().castVote(
              voteId: widget.voteId,
              choice: choice,
            );
    if (!mounted) return;
    switch (result) {
      case OperationSuccess<void>():
        await _load();
      case OperationBlocked<void>():
        await showServerAuthorityRequired(context);
      case OperationFailure<void>(:final error):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(error.toString())),
        );
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Vote')),
        body: ResourceView<VoteDetails>(
          resource: _state,
          builder: (BuildContext context, VoteDetails vote) => ListView(
            padding: const EdgeInsets.all(20),
            children: <Widget>[
              Text(vote.summary.title, style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 8),
              Text(vote.description, style: Theme.of(context).textTheme.bodyLarge),
              const SizedBox(height: 18),
              SectionCard(
                child: Column(
                  children: <Widget>[
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Version des règles'),
                      trailing: Text('${vote.rulesVersion}'),
                    ),
                    const Divider(),
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: const Text('Quorum'),
                      trailing: Text('${vote.quorum}'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              RadioGroup<VoteChoice>(
                groupValue: _choice,
                onChanged: (VoteChoice? value) => setState(() => _choice = value),
                child: Column(
                  children: <Widget>[
                    RadioListTile<VoteChoice>(
                      value: VoteChoice.forChoice,
                      title: const Text('Pour'),
                    ),
                    RadioListTile<VoteChoice>(
                      value: VoteChoice.against,
                      title: const Text('Contre'),
                    ),
                    RadioListTile<VoteChoice>(
                      value: VoteChoice.abstain,
                      title: const Text('Abstention'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _choice == null ? null : _submit,
                child: const Text('Confirmer mon vote'),
              ),
              const SizedBox(height: 12),
              const Text(
                'Le vote est enregistré uniquement par le serveur. Le client ne crée aucun vote local.',
              ),
            ],
          ),
        ),
      );
}
