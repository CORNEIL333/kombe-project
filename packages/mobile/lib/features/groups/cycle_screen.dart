import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_tokens.g.dart';
import '../../core/formatters/labels.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/group_hero_card.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import 'groups_view_models.dart';

/// Cycle & bénéficiaires : suivi des tours, lancement d'une saison
/// (démarrage du premier cycle ou renouvellement) avec choix d'ordre.
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

  void _recharger() {
    final GroupRepository repo = context.read<GroupRepository>();
    setState(() {
      _vm?.load();
      _group = repo.getGroup(widget.groupId);
    });
  }

  /// Renvoie null en cas de succès, sinon le message à afficher.
  Future<String?> _lancerCycle(CycleOrderKind order, {required bool renouvellement}) async {
    final GroupRepository repo = context.read<GroupRepository>();
    final OperationResult<void> r = renouvellement
        ? await repo.renewCycle(widget.groupId, order)
        : await repo.startCycle(widget.groupId, order);
    switch (r) {
      case OperationSuccess<void>():
        _recharger();
        return null;
      case OperationBlocked<void>(:final reason):
        return reason;
      case OperationFailure<void>(:final error):
        return error.toString();
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
          builder: (BuildContext context, Widget? child) => FutureBuilder<Resource<GroupDetails>>(
            future: _group,
            builder: (BuildContext context, AsyncSnapshot<Resource<GroupDetails>> snap) {
              final GroupSummary? group = switch (snap.data) {
                ResourceReady<GroupDetails>(:final GroupDetails data) => data.summary,
                _ => null,
              };
              final bool bureau = group?.role == GroupRole.administrator || group?.role == GroupRole.secretary;
              return switch (_vm!.state) {
                ResourceLoading<CycleDetails>() => const Center(child: CircularProgressIndicator()),
                ResourceUnavailable<CycleDetails>() => ListView(
                    padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
                    children: <Widget>[
                      if (group != null) ...<Widget>[GroupHeroCard(group: group), const SizedBox(height: 22)],
                      _PanneauLancementCycle(
                        bureau: bureau,
                        onLancer: (CycleOrderKind order) => _lancerCycle(order, renouvellement: false),
                      ),
                    ],
                  ),
                ResourceFailure<CycleDetails>(:final Object error) => ErrorState(message: error.toString()),
                ResourceReady<CycleDetails>(:final CycleDetails data) => CycleView(
                    cycle: data,
                    group: group,
                    bureau: bureau,
                    onSeeAll: () => context.push('/app/groups/${widget.groupId}/beneficiaries'),
                    onRenouveler: (CycleOrderKind order) => _lancerCycle(order, renouvellement: true),
                  ),
              };
            },
          ),
        ),
      );
}

/// « Qui reçoit en premier ? » : cartes radio d'ordre, bouton de lancement.
/// [renouvellement] inverse le libellé (nouvelle saison) et l'appel.
class _PanneauLancementCycle extends StatefulWidget {
  const _PanneauLancementCycle({required this.bureau, required this.onLancer, this.renouvellement = false});

  final bool bureau;
  final bool renouvellement;
  final Future<String?> Function(CycleOrderKind order) onLancer;

  @override
  State<_PanneauLancementCycle> createState() => _PanneauLancementCycleState();
}

class _PanneauLancementCycleState extends State<_PanneauLancementCycle> {
  CycleOrderKind _ordre = CycleOrderKind.draw;
  bool _occupe = false;
  String? _erreur;

  Future<void> _lancer() async {
    setState(() {
      _occupe = true;
      _erreur = null;
    });
    final String? erreur = await widget.onLancer(_ordre);
    if (!mounted) return;
    if (erreur == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(widget.renouvellement ? 'Nouveau cycle lancé — le calendrier est prêt' : 'Cycle lancé — le calendrier des tours est prêt')),
      );
      return;
    }
    setState(() {
      _occupe = false;
      _erreur = erreur;
    });
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: KombeTokens.forest50, borderRadius: BorderRadius.circular(20)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(children: <Widget>[
                Icon(widget.renouvellement ? Icons.celebration_outlined : Icons.hourglass_top_rounded, color: KombeColors.forest, size: 24),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    widget.renouvellement ? 'Saison terminée — lancez la suivante' : 'Le cycle n’est pas encore lancé',
                    style: t.titleLarge,
                  ),
                ),
              ]),
              const SizedBox(height: 12),
              Text(
                widget.renouvellement
                    ? 'Tous les tours de cette saison ont été servis. Pour la saison suivante, le bureau choisit à nouveau l’ordre de passage : les tours continuent (T13, T14…) et le calendrier est affiché à tous.'
                    : 'Aucun tour n’est programmé : personne ne reçoit encore. Le bureau lance le cycle une fois les conditions réunies — au moins deux membres actifs, un trésorier désigné, et les statuts acceptés par tous.',
                style: t.bodyMedium,
              ),
            ],
          ),
        ),
        if (widget.bureau) ...<Widget>[
          const SizedBox(height: 16),
          Text('Qui reçoit en premier ?', style: t.titleLarge),
          const SizedBox(height: 4),
          for (final CycleOrderKind kind in CycleOrderKind.values)
            _CarteOrdre(
              titre: kind.label,
              sousTitre: kind.aide,
              groupe: kind,
              selectionne: _ordre == kind,
              onSelectionne: _occupe ? null : () => setState(() => _ordre = kind),
            ),
          if (_erreur != null) ...<Widget>[
            const SizedBox(height: 8),
            Text(_erreur!, style: t.bodySmall?.copyWith(color: KombeColors.danger)),
          ],
          const SizedBox(height: 12),
          FilledButton(
            onPressed: _occupe ? null : _lancer,
            child: _occupe
                ? const SizedBox(height: 18, width: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : Text(widget.renouvellement ? 'Lancer le nouveau cycle' : 'Lancer le cycle'),
          ),
        ] else ...<Widget>[
          const SizedBox(height: 12),
          Text(
            'Seuls le président, le vice-président ou le secrétaire général peuvent lancer le cycle.',
            style: t.bodySmall,
          ),
        ],
      ],
    );
  }
}

class CycleView extends StatelessWidget {
  const CycleView({
    required this.cycle,
    required this.onSeeAll,
    required this.bureau,
    required this.onRenouveler,
    super.key,
    this.group,
  });
  final CycleDetails cycle;
  final GroupSummary? group;
  final bool bureau;
  final VoidCallback onSeeAll;
  final Future<String?> Function(CycleOrderKind order) onRenouveler;

  bool get _saisonTerminee =>
      cycle.beneficiaries.isNotEmpty && cycle.beneficiaries.every((BeneficiaryTurn b) => b.status == BeneficiaryStatus.received);

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
        if (_saisonTerminee) ...<Widget>[
          _PanneauLancementCycle(
            bureau: bureau,
            renouvellement: true,
            onLancer: onRenouveler,
          ),
          const SizedBox(height: 24),
        ],
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
            IconButton(
              tooltip: 'Voir tout',
              onPressed: onSeeAll,
              icon: const Icon(Icons.arrow_forward_rounded, color: KombeColors.goldDark),
            ),
          ],
        ),
        for (final BeneficiaryTurn item in cycle.beneficiaries.take(6)) _TurnRow(turn: item),
      ],
    );
  }
}

/// Carte radio d'ordre : titre + explication honnête, cible entière tactile.
class _CarteOrdre extends StatelessWidget {
  const _CarteOrdre({
    required this.titre,
    required this.sousTitre,
    required this.groupe,
    required this.selectionne,
    required this.onSelectionne,
  });

  final String titre;
  final String sousTitre;
  final CycleOrderKind groupe;
  final bool selectionne;
  final VoidCallback? onSelectionne;

  @override
  Widget build(BuildContext context) {
    return RadioListTile<CycleOrderKind>(
      value: groupe,
      groupValue: selectionne ? groupe : null,
      onChanged: onSelectionne == null ? null : (CycleOrderKind? v) => onSelectionne!(),
      title: Text(titre, style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(sousTitre),
      ),
      activeColor: KombeColors.forest,
      contentPadding: EdgeInsets.zero,
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
            Expanded(child: Text.rich(TextSpan(children: <InlineSpan>[
              TextSpan(text: 'Bénéficiaire actuel ', style: t.titleSmall?.copyWith(fontSize: 16)),
              TextSpan(text: '(Tour ${turn.turnNumber})', style: t.bodyMedium?.copyWith(color: KombeColors.ink)),
            ]))),
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
