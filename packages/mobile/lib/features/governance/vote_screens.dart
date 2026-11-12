import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/governance.dart';
import '../../domain/repositories/governance_repository.dart';
import '../../l10n/app_localizations.dart';
import '../../l10n/kombe_l10n.dart';

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
        appBar: AppBar(title: Text(AppLocalizations.of(context).votesDecisions)),
        body: ResourceView<List<VoteSummary>>(
          resource: _state,
          emptyWhen: (List<VoteSummary> votes) => votes.isEmpty,
          onRetry: _load,
          emptyTitle: AppLocalizations.of(context).voAucunVoteEnCours,
          emptyBody: AppLocalizations.of(context).voQuandLeBureauOuvreUn,
          builder: (BuildContext context, List<VoteSummary> votes) {
            final List<VoteSummary> todo = votes.where((VoteSummary v) => !v.hasCurrentUserVoted).toList();
            final List<VoteSummary> done = votes.where((VoteSummary v) => v.hasCurrentUserVoted).toList();
            return ListView(
              padding: const EdgeInsets.only(bottom: 32),
              children: <Widget>[
                for (final (String title, List<VoteSummary> items) in <(String, List<VoteSummary>)>[(AppLocalizations.of(context).voVoter, todo), (AppLocalizations.of(context).voDejaVote, done)])
                  if (items.isNotEmpty) ...<Widget>[
                    KombeSection('$title · ${items.length}'),
                    KombeGroupedList(children: <Widget>[for (final VoteSummary v in items) _VoteRow(vote: v)]),
                  ],
              ],
            );
          },
        ),
      );
}

class _VoteRow extends StatelessWidget {
  const _VoteRow({required this.vote});
  final VoteSummary vote;

  @override
  Widget build(BuildContext context) {
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final DateTime close = vote.closesAtUtc.toLocal();
    final int days = close.difference(DateTime.now()).inDays;
    final String when = close.isBefore(DateTime.now())
        ? AppLocalizations.of(context).voClosedOn(DateFormat('d MMM', locale).format(close))
        : days < 1
            ? AppLocalizations.of(context).voClotureAujourdhui(DateFormat.Hm(locale).format(close))
            : AppLocalizations.of(context).voClosesOnIn(DateFormat('d MMM', locale).format(close), days);
    return ListTile(
      minTileHeight: 76,
      leading: KombeIconBadge(Icons.how_to_vote_outlined, tone: vote.hasCurrentUserVoted ? KombeTone.success : KombeTone.info),
      title: Text(vote.title, maxLines: 2, overflow: TextOverflow.ellipsis),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: <Widget>[
            if (vote.hasCurrentUserVoted)
              StatusPill(AppLocalizations.of(context).voVote, tone: KombeTone.success, icon: Icons.check_rounded)
            else
              StatusPill(AppLocalizations.of(context).voVoter, tone: KombeTone.warning),
            Text(when, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
      trailing: const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
      onTap: () => context.push('/app/votes/${vote.id}'),
    );
  }
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
      showKombeMessage(context, AppLocalizations.of(context).voVotreBulletinEstEnregistreVote);
      await _load();
    }
  }

  static String _label(VoteChoice c) => switch (c) {
        VoteChoice.forChoice => KombeL10n.current.voPour,
        VoteChoice.against => KombeL10n.current.voContre,
        VoteChoice.abstain => KombeL10n.current.voAbstention,
      };

  static String _outcome(String state) => switch (state) {
        'adopted' => KombeL10n.current.voAdopte,
        'rejected' => KombeL10n.current.voRejete,
        'cancelled' => KombeL10n.current.voAnnule,
        'lifted' => KombeL10n.current.voAdoptePuisLeve,
        _ => KombeL10n.current.voClos,
      };

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).voVote2)),
      body: ResourceView<VoteDetails>(
        resource: _state,
        onRetry: _load,
        builder: (BuildContext context, VoteDetails vote) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: <Widget>[
            Align(
              alignment: Alignment.centerLeft,
              child: StatusPill(vote.open ? AppLocalizations.of(context).voVoteOuvert : _outcome(vote.state), tone: vote.open ? KombeTone.info : KombeTone.neutral, icon: Icons.how_to_vote_outlined),
            ),
            const SizedBox(height: 12),
            Text(vote.summary.title, style: t.headlineSmall),
            if (vote.description.isNotEmpty) ...<Widget>[
              const SizedBox(height: 8),
              Text(vote.description, style: t.bodyLarge),
            ],
            const SizedBox(height: 18),
            // Participation : bulletins sur électeurs ; majorité requise en clair.
            KombeCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text.rich(
                    TextSpan(
                      children: <InlineSpan>[
                        TextSpan(text: '${vote.ballots}', style: KombeType.amount(size: 26)),
                        TextSpan(text: l10n.voBallotsOf(vote.electorate, l10n.voteBallots.toLowerCase()), style: t.bodyMedium),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  LinearProgressIndicator(value: vote.electorate == 0 ? 0 : (vote.ballots / vote.electorate).clamp(0, 1)),
                  const SizedBox(height: 10),
                  Text(AppLocalizations.of(context).voPour2(l10n.voteMajority, vote.requiredYes), style: t.bodySmall),
                ],
              ),
            ),
            const SizedBox(height: 20),
            if (!vote.open)
              Semantics(
                liveRegion: true,
                child: vote.result == null
                    ? Text(AppLocalizations.of(context).voCeVoteEstClos(_outcome(vote.state).toLowerCase()), style: t.titleMedium)
                    : _Result(yes: vote.result!.yes, no: vote.result!.no, abstain: vote.result!.abstain, outcome: _outcome(vote.state)),
              )
            else if (vote.myChoice != null)
              KombeCard(
                color: KombeTone.success.bg,
                borderColor: null,
                child: Row(
                  children: <Widget>[
                    const Icon(Icons.verified_outlined, color: KombeColors.jade),
                    const SizedBox(width: 12),
                    Expanded(child: Text(AppLocalizations.of(context).voVousAvezVoteLeResultat(_label(vote.myChoice!)), style: t.titleSmall)),
                  ],
                ),
              )
            else if (!vote.canVote)
              Text(AppLocalizations.of(context).voVousNeVotezPasSur, style: t.titleMedium)
            else ...<Widget>[
              Text(AppLocalizations.of(context).voVotreChoix, style: t.titleMedium),
              const SizedBox(height: 10),
              // Bulletin : trois grandes cibles, la sélection est visible (forme + couleur).
              Semantics(
                container: true,
                label: AppLocalizations.of(context).voBulletin,
                child: Row(
                  children: <Widget>[
                    for (final VoteChoice c in VoteChoice.values) ...<Widget>[
                      if (c != VoteChoice.values.first) const SizedBox(width: 10),
                      Expanded(child: _ChoiceTile(label: _label(c), icon: _icon(c), selected: _choice == c, onTap: _sending ? null : () => setState(() => _choice = c))),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed: _choice == null || _sending ? null : _submit,
                child: _sending
                    ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.4))
                    : Text(AppLocalizations.of(context).voConfirmerMonVote),
              ),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Icon(Icons.lock_outline_rounded, size: 16, color: KombeColors.slate),
                  const SizedBox(width: 8),
                  Expanded(child: Text(AppLocalizations.of(context).voVotreBulletinEstSecretPersonne, style: t.bodySmall)),
                ],
              ),
            ],
            const SizedBox(height: 16),
            Text(AppLocalizations.of(context).voCloturePrevue(DateFormat.yMMMd(Localizations.localeOf(context).toLanguageTag()).add_Hm().format(vote.summary.closesAtUtc.toLocal())),
                style: t.bodySmall),
          ],
        ),
      ),
    );
  }

  static IconData _icon(VoteChoice c) => switch (c) {
        VoteChoice.forChoice => Icons.thumb_up_alt_outlined,
        VoteChoice.against => Icons.thumb_down_alt_outlined,
        VoteChoice.abstain => Icons.remove_circle_outline_rounded,
      };
}

class _ChoiceTile extends StatelessWidget {
  const _ChoiceTile({required this.label, required this.icon, required this.selected, required this.onTap});
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          decoration: BoxDecoration(
            color: selected ? KombeColors.brand : Colors.white,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: selected ? KombeColors.brand : KombeColors.lineStrong, width: 1.4),
          ),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              borderRadius: BorderRadius.circular(20),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 6),
                child: Column(
                  children: <Widget>[
                    Icon(selected ? Icons.check_circle_rounded : icon, color: selected ? Colors.white : KombeColors.forest),
                    const SizedBox(height: 6),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14, color: selected ? Colors.white : KombeColors.forest),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}

/// Résultat publié : barres proportionnelles, chiffres exacts.
class _Result extends StatelessWidget {
  const _Result({required this.yes, required this.no, required this.abstain, required this.outcome});
  final int yes;
  final int no;
  final int abstain;
  final String outcome;

  @override
  Widget build(BuildContext context) {
    final int total = yes + no + abstain;
    Widget bar(String label, int n, Color c) => Padding(
          padding: const EdgeInsets.only(top: 10),
          child: Row(
            children: <Widget>[
              SizedBox(width: 92, child: Text(label, style: Theme.of(context).textTheme.bodyMedium)),
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(value: total == 0 ? 0 : n / total, color: c, minHeight: 10),
                ),
              ),
              SizedBox(width: 40, child: Text('$n', textAlign: TextAlign.right, style: KombeType.amount(size: 16))),
            ],
          ),
        );
    return KombeCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(AppLocalizations.of(context).voResultat(outcome), style: Theme.of(context).textTheme.titleMedium),
          bar(AppLocalizations.of(context).voPour, yes, KombeColors.jade),
          bar(AppLocalizations.of(context).voContre, no, KombeColors.danger),
          bar(AppLocalizations.of(context).voAbstention, abstain, KombeColors.slate),
        ],
      ),
    );
  }
}
