import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/governance.dart';
import '../../domain/repositories/governance_repository.dart';
import '../../l10n/app_localizations.dart';

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
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<VoteDetails> state = await context.read<GovernanceRepository>().getVote(widget.voteId);
    if (mounted) setState(() => _state = state);
  }

  Future<void> _submit() async {
    final VoteChoice? choice = _choice;
    if (choice == null || _sending) return;
    setState(() => _sending = true);
    final OperationResult<void> result = await context.read<GovernanceRepository>().castVote(voteId: widget.voteId, choice: choice);
    if (!mounted) return;
    setState(() => _sending = false);
    if (reportOutcome(context, result)) {
      showKombeMessage(context, 'Votre bulletin est enregistré (vote secret).');
      await _load();
    }
  }

  static String _label(VoteChoice c) => switch (c) {
        VoteChoice.forChoice => 'Pour',
        VoteChoice.against => 'Contre',
        VoteChoice.abstain => 'Abstention',
      };

  static String _outcome(String state) => switch (state) {
        'adopted' => 'Adopté',
        'rejected' => 'Rejeté',
        'cancelled' => 'Annulé',
        'lifted' => 'Adopté, puis levé',
        _ => 'Clos',
      };

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: const Text('Vote')),
      body: ResourceView<VoteDetails>(
        resource: _state,
        onRetry: _load,
        builder: (BuildContext context, VoteDetails vote) => ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            Text(vote.summary.title, style: t.headlineSmall),
            if (vote.description.isNotEmpty) ...<Widget>[
              const SizedBox(height: 8),
              Text(vote.description, style: t.bodyLarge),
            ],
            const SizedBox(height: 16),
            _row(t, l10n.voteElectorate, '${vote.electorate}'),
            _row(t, l10n.voteMajority, '${vote.requiredYes}'),
            _row(t, l10n.voteBallots, '${vote.ballots}'),
            const SizedBox(height: 20),
            if (!vote.open)
              // Objet déjà traité (ex. ouvert depuis la notification du résultat).
              Semantics(
                liveRegion: true,
                child: Text(
                  vote.result == null
                      ? 'Ce vote est clos : ${_outcome(vote.state).toLowerCase()}.'
                      : 'Ce vote est clos : ${_outcome(vote.state).toLowerCase()} '
                          '(${vote.result!.yes} pour, ${vote.result!.no} contre, ${vote.result!.abstain} abstentions).',
                  style: t.titleMedium,
                ),
              )
            else if (vote.myChoice != null)
              Text('Vous avez voté : ${_label(vote.myChoice!)}. Le résultat sera publié au dépouillement.', style: t.titleMedium)
            else if (!vote.canVote)
              Text('Vous ne votez pas sur ce scrutin.', style: t.titleMedium)
            else ...<Widget>[
              RadioGroup<VoteChoice>(
                groupValue: _choice,
                onChanged: (VoteChoice? value) => setState(() => _choice = value),
                child: Column(
                  children: <Widget>[
                    for (final VoteChoice c in VoteChoice.values) RadioListTile<VoteChoice>(value: c, title: Text(_label(c))),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _choice == null || _sending ? null : _submit,
                child: _sending
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                    : const Text('Confirmer mon vote'),
              ),
              const SizedBox(height: 12),
              const Text(
                'Votre bulletin est secret : personne ne voit ce que vous avez voté, seulement le résultat.',
              ),
            ],
            const SizedBox(height: 8),
            Text('Clôture prévue : ${DateFormat.yMMMd(Localizations.localeOf(context).toLanguageTag()).add_Hm().format(vote.summary.closesAtUtc.toLocal())}',
                style: t.bodySmall),
          ],
        ),
      ),
    );
  }

  Widget _row(TextTheme t, String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(children: <Widget>[Expanded(child: Text(k, style: t.bodyMedium)), Text(v, style: t.titleSmall)]),
      );
}
