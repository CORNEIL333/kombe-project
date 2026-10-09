import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_tokens.g.dart';
import '../../core/formatters/labels.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/group_hero_card.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import 'groups_view_models.dart';

/// Cycle & bénéficiaires (maquette « Suivi du cycle et ordre des bénéficiaires »).
class CycleScreen extends StatefulWidget {
  const CycleScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<CycleScreen> createState() => _CycleScreenState();
}

class _CycleScreenState extends State<CycleScreen> {
  CycleViewModel? _vm;
  Future<Resource<GroupDetails>>? _group;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_vm == null) {
      final GroupRepository repo = context.read<GroupRepository>();
      _vm = CycleViewModel(repo, widget.groupId)..load();
      _group = repo.getGroup(widget.groupId);
    }
  }

  @override
  void dispose() {
    _vm?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(centerTitle: true, title: const KombeLogo(size: 38)),
        body: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) => ResourceView<CycleDetails>(
            resource: _vm!.state,
            builder: (BuildContext context, CycleDetails cycle) => FutureBuilder<Resource<GroupDetails>>(
              future: _group,
              builder: (BuildContext context, AsyncSnapshot<Resource<GroupDetails>> snap) => CycleView(
                cycle: cycle,
                group: switch (snap.data) {
                  ResourceReady<GroupDetails>(:final GroupDetails data) => data.summary,
                  _ => null,
                },
                onSeeAll: () => context.push('/app/groups/${widget.groupId}/beneficiaries'),
              ),
            ),
          ),
        ),
      );
}

class CycleView extends StatelessWidget {
  const CycleView({required this.cycle, required this.onSeeAll, super.key, this.group});
  final CycleDetails cycle;
  final GroupSummary? group;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    BeneficiaryTurn? current;
    for (final BeneficiaryTurn b in cycle.beneficiaries) {
      if (b.status == BeneficiaryStatus.current) current = b;
    }
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
      children: <Widget>[
        if (group != null) ...<Widget>[GroupHeroCard(group: group!), const SizedBox(height: 22)],
        Row(
          children: <Widget>[
            Expanded(child: Text('Progression du cycle', style: t.titleLarge)),
            Text('${cycle.currentTurn}/${cycle.totalTurns} tours', style: t.bodyMedium),
          ],
        ),
        const SizedBox(height: 14),
        _TurnTrack(current: cycle.currentTurn, total: cycle.totalTurns),
        if (current != null) ...<Widget>[
          const SizedBox(height: 22),
          _CurrentBeneficiary(turn: current),
        ],
        const SizedBox(height: 24),
        Row(
          children: <Widget>[
            Expanded(child: Text('Ordre des bénéficiaires', style: t.titleLarge)),
            TextButton(
              onPressed: onSeeAll,
              style: TextButton.styleFrom(foregroundColor: KombeColors.goldDark),
              child: const Text('Voir tout'),
            ),
          ],
        ),
        for (final BeneficiaryTurn item in cycle.beneficiaries.take(6)) _TurnRow(turn: item),
      ],
    );
  }
}

/// Frise T1, T2, … : coché = passé, cerclé = en cours, gris = à venir.
class _TurnTrack extends StatelessWidget {
  const _TurnTrack({required this.current, required this.total});
  final int current;
  final int total;

  @override
  Widget build(BuildContext context) {
    final int shown = total <= 7 ? total : 6;
    final List<Widget> nodes = <Widget>[];
    for (int i = 1; i <= shown; i++) {
      final bool done = i < current;
      final bool now = i == current;
      nodes.add(Column(
        children: <Widget>[
          Container(
            width: now ? 34 : 28,
            height: now ? 34 : 28,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: done || now ? KombeColors.forest : KombeTokens.sand200,
              boxShadow: now ? <BoxShadow>[BoxShadow(color: KombeColors.forest.withValues(alpha: .18), spreadRadius: 5)] : null,
            ),
            child: done || now ? const Icon(Icons.check_rounded, size: 18, color: Colors.white) : null,
          ),
          const SizedBox(height: 6),
          Text('T$i', style: TextStyle(fontSize: 12, fontWeight: now ? FontWeight.w800 : FontWeight.w600, color: now ? KombeColors.ink : KombeColors.slate)),
        ],
      ));
      if (i < shown || total > shown) {
        nodes.add(Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 20),
            child: Container(height: 3, color: i < current ? KombeColors.forest : KombeTokens.sand200),
          ),
        ));
      }
    }
    if (total > shown) {
      nodes.add(const Column(children: <Widget>[
        SizedBox(height: 28, child: Center(child: Text('…', style: TextStyle(color: KombeColors.slate, fontWeight: FontWeight.w800)))),
        SizedBox(height: 6),
        Text(' ', style: TextStyle(fontSize: 12)),
      ]));
    }
    return Semantics(
      label: 'Tour $current sur $total',
      child: ExcludeSemantics(child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: nodes)),
    );
  }
}

class _CurrentBeneficiary extends StatelessWidget {
  const _CurrentBeneficiary({required this.turn});
  final BeneficiaryTurn turn;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String locale = Localizations.localeOf(context).toLanguageTag();
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: KombeTokens.forest50, borderRadius: BorderRadius.circular(20)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(children: <Widget>[
            const Icon(Icons.workspace_premium_rounded, color: KombeColors.gold, size: 22),
            const SizedBox(width: 8),
            Text.rich(TextSpan(children: <InlineSpan>[
              TextSpan(text: 'Bénéficiaire actuel ', style: t.titleSmall?.copyWith(fontSize: 16)),
              TextSpan(text: '(Tour ${turn.turnNumber})', style: t.bodyMedium?.copyWith(color: KombeColors.ink)),
            ])),
          ]),
          const SizedBox(height: 14),
          Row(
            children: <Widget>[
              KombeAvatar(name: turn.displayName, url: turn.avatarUrl, size: 76),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(turn.displayName, style: t.titleLarge),
                    const SizedBox(height: 4),
                    Text('Reçoit le pot de ce tour', style: t.bodyMedium),
                    const SizedBox(height: 4),
                    Text(DateFormat.yMMMMd(locale).format(turn.dueAtUtc.toLocal()), style: t.titleMedium?.copyWith(color: KombeColors.forest)),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _TurnRow extends StatelessWidget {
  const _TurnRow({required this.turn});
  final BeneficiaryTurn turn;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final bool current = turn.status == BeneficiaryStatus.current;
    final Widget chip = switch (turn.status) {
      BeneficiaryStatus.received => KombeChip(label: KombeLabels.beneficiaryStatus(turn.status), icon: Icons.check_circle_outline_rounded),
      BeneficiaryStatus.current => const KombeChip(label: 'En cours', tone: ChipTone.gold),
      BeneficiaryStatus.upcoming => KombeChip(label: KombeLabels.beneficiaryStatus(turn.status), tone: ChipTone.neutral),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
      decoration: BoxDecoration(
        color: current ? KombeTokens.gold50 : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: <Widget>[
          Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: current ? KombeColors.goldDark : Colors.white,
              border: Border.all(color: current ? Colors.transparent : KombeColors.lineStrong),
            ),
            child: Text('${turn.turnNumber}', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: current ? Colors.white : KombeColors.ink)),
          ),
          const SizedBox(width: 10),
          KombeAvatar(name: turn.displayName, url: turn.avatarUrl, size: 40),
          const SizedBox(width: 10),
          Expanded(child: Text(turn.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.titleSmall)),
          chip,
          const SizedBox(width: 10),
          Text(DateFormat.MMMd(locale).format(turn.dueAtUtc.toLocal()), style: t.bodySmall),
        ],
      ),
    );
  }
}
