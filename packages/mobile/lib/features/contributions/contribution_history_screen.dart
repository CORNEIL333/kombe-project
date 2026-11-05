import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../app/active_group_controller.dart';
import '../../app/router/main_shell.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/widgets/kombe_components.dart';
import '../../domain/entities/group.dart';
import '../../core/formatters/labels.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_screen_header.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/draft_repository.dart';
import 'contribution_status_view.dart';

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
    final ContributionDraftRepository draftsRepo = context.read<ContributionDraftRepository>();
    final Resource<List<Contribution>> remote =
        await context.read<ContributionRepository>().listHistory();
    // L'historique enregistré s'affiche même si la lecture des brouillons locaux échoue.
    if (mounted) setState(() => _remote = remote);
    try {
      final List<ContributionDraft> drafts = await draftsRepo.listDrafts();
      if (mounted) setState(() => _drafts = drafts);
    } on Object {
      if (mounted) setState(() => _drafts = const <ContributionDraft>[]);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: KombeTopBar(
          actions: <Widget>[
            if (context.watch<ActiveGroupController>().active case final GroupSummary g)
              IconButton(
                tooltip: 'J’ai payé',
                onPressed: () => context.push('/app/groups/${Uri.encodeComponent(g.id)}/contributions/new'),
                icon: const Icon(Icons.add_rounded),
              ),
          ],
        ),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: <Widget>[
              const KombeScreenHeader(title: 'Cotisations'),
              if (_remote case ResourceReady<List<Contribution>>(:final List<Contribution> data) when data.isNotEmpty) _Totals(contributions: data),
              if (_drafts.isNotEmpty) ...<Widget>[
                const KombeSection('À terminer'),
                KombeGroupedList(
                  children: <Widget>[
                    for (final ContributionDraft draft in _drafts)
                      ListTile(
                        minTileHeight: 68,
                        leading: KombeIconBadge(
                          draft.sending ? Icons.sync_problem_rounded : Icons.edit_note_rounded,
                          tone: draft.sending ? KombeTone.danger : KombeTone.neutral,
                        ),
                        title: Text(Xaf.format(draft.amountXaf), style: KombeType.amount(size: 18)),
                        subtitle: Text(draft.sending ? 'Envoi interrompu — à reprendre' : 'Brouillon, pas encore envoyé'),
                        trailing: const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
                        onTap: () => context.push('/app/groups/${draft.groupId}/contributions/new?draft=${draft.localId}'),
                      ),
                  ],
                ),
              ],
              const KombeSection('Mes paiements'),
              ResourceView<List<Contribution>>(
                resource: _remote,
                onRetry: _load,
                emptyWhen: (List<Contribution> data) => data.isEmpty,
                emptyTitle: 'Aucun paiement',
                emptyBody: 'Vos paiements apparaîtront ici.',
                builder: (BuildContext context, List<Contribution> contributions) => Column(
                  children: <Widget>[
                    for (final MapEntry<String, List<Contribution>> month in _byMonth(context, contributions).entries) ...<Widget>[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(24, 6, 24, 8),
                        child: Align(alignment: Alignment.centerLeft, child: Text(month.key.toUpperCase(), style: KombeType.eyebrow)),
                      ),
                      KombeGroupedList(
                        children: <Widget>[for (final Contribution c in month.value) _ContributionRow(c: c)],
                      ),
                      const SizedBox(height: 14),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      );

  /// Regroupe par mois de déclaration (« Sans date » quand le serveur n'en rend pas).
  static Map<String, List<Contribution>> _byMonth(BuildContext context, List<Contribution> all) {
    final DateFormat f = DateFormat('MMMM y', Localizations.localeOf(context).toLanguageTag());
    final Map<String, List<Contribution>> out = <String, List<Contribution>>{};
    for (final Contribution c in all) {
      final DateTime? d = c.declaredAtUtc;
      out.putIfAbsent(d == null ? 'Sans date' : f.format(d.toLocal()), () => <Contribution>[]).add(c);
    }
    return out;
  }
}

/// Deux totaux réels (calculés sur la liste reçue) : confirmé et en attente.
class _Totals extends StatelessWidget {
  const _Totals({required this.contributions});
  final List<Contribution> contributions;

  @override
  Widget build(BuildContext context) {
    int sum(bool Function(ContributionStatus) keep) =>
        contributions.where((Contribution c) => keep(c.status)).fold<int>(0, (int s, Contribution c) => s + c.amountXaf);
    final int confirmed = sum((ContributionStatus s) => s == ContributionStatus.confirmed || s == ContributionStatus.validated);
    final int pending = sum((ContributionStatus s) => s == ContributionStatus.submitted);
    Widget tile(String label, int xaf, Color bg, Color fg, IconData icon) => Expanded(
          child: KombeCard(
            color: bg,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Icon(icon, size: 16, color: fg),
                    const SizedBox(width: 6),
                    Flexible(child: Text(label, style: KombeType.eyebrow.copyWith(color: fg), maxLines: 1, overflow: TextOverflow.ellipsis)),
                  ],
                ),
                const SizedBox(height: 8),
                FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: KombeAmount(xaf, size: 24, color: fg)),
              ],
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 0),
      child: Row(
        children: <Widget>[
          tile('CONFIRMÉ', confirmed, KombeColors.emerald, Colors.white, Icons.check_circle_outline_rounded),
          const SizedBox(width: 12),
          tile('EN ATTENTE', pending, KombeColors.goldWarm, KombeColors.ink, Icons.hourglass_top_rounded),
        ],
      ),
    );
  }
}

class _ContributionRow extends StatelessWidget {
  const _ContributionRow({required this.c});
  final Contribution c;

  @override
  Widget build(BuildContext context) {
    final DateTime? d = c.declaredAtUtc;
    final String? when = d == null ? null : DateFormat('d MMM', Localizations.localeOf(context).toLanguageTag()).format(d.toLocal());
    final String? channel = c.channel == null ? null : KombeLabels.channel(c.channel);
    final String meta = <String?>[when, channel].whereType<String>().join(' · ');
    return ListTile(
      minTileHeight: 76,
      leading: KombeIconBadge(contributionIcon(c.status), tone: contributionTone(c.status)),
      title: Text(Xaf.format(c.amountXaf), style: KombeType.amount(size: 18)),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Wrap(
          spacing: 8,
          runSpacing: 4,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: <Widget>[
            ContributionStatusPill(c.status),
            if (meta.isNotEmpty) Text(meta, style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
      ),
      trailing: const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
      onTap: () => context.push('/app/contributions/${c.id}'),
    );
  }
}
