import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_tokens.g.dart';
import '../../core/widgets/cycle_orbit.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/status_ring.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/repositories/group_repository.dart';
import 'groups_view_models.dart';

class CycleScreen extends StatefulWidget {
  const CycleScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<CycleScreen> createState() => _CycleScreenState();
}

class _CycleScreenState extends State<CycleScreen> {
  CycleViewModel? _vm;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _vm ??= CycleViewModel(context.read<GroupRepository>(), widget.groupId)..load();
  }

  @override
  void dispose() {
    _vm?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Cycle & bénéficiaires')),
        body: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) => ResourceView<CycleDetails>(
            resource: _vm!.state,
            builder: (BuildContext context, CycleDetails cycle) => CycleView(
              cycle: cycle,
              onSeeAll: () => context.push('/app/groups/${widget.groupId}/beneficiaries'),
            ),
          ),
        ),
      );
}

/// Détail du cycle : l'orbite est l'objet principal ; toucher un nœud
/// révèle le tour correspondant (sélection contextuelle, mandat §23).
class CycleView extends StatefulWidget {
  const CycleView({required this.cycle, required this.onSeeAll, super.key, this.animate = true});
  final CycleDetails cycle;
  final VoidCallback onSeeAll;
  final bool animate;

  @override
  State<CycleView> createState() => _CycleViewState();
}

class _CycleViewState extends State<CycleView> {
  int? _selected;

  BeneficiaryTurn? _turn(int n) {
    for (final BeneficiaryTurn t in widget.cycle.beneficiaries) {
      if (t.turnNumber == n) return t;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final CycleDetails cycle = widget.cycle;
    final TextTheme t = Theme.of(context).textTheme;
    final int focus = _selected ?? cycle.currentTurn;
    final BeneficiaryTurn? focused = _turn(focus);
    final String locale = Localizations.localeOf(context).toLanguageTag();
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 40),
      children: <Widget>[
        Center(
          child: KombeCycleOrbit(
            total: cycle.totalTurns,
            current: cycle.currentTurn,
            size: 260,
            animate: widget.animate,
            selected: _selected,
            onSelect: (int n) => setState(() => _selected = n == _selected ? null : n),
            semanticLabel: 'Cycle de ${cycle.totalTurns} tours, tour ${cycle.currentTurn} en cours. Touchez un tour pour le détail.',
            center: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text('Tour', style: t.labelMedium),
                Text('$focus', style: t.displaySmall?.copyWith(fontFamily: 'Manrope', fontWeight: FontWeight.w800)),
                Text('sur ${cycle.totalTurns}', style: t.bodySmall),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        AnimatedSwitcher(
          duration: KombeMotion.ui,
          child: focused == null
              ? const SizedBox(height: 8)
              : Container(
                  key: ValueKey<int>(focused.turnNumber),
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(KombeTokens.radiusLg),
                    border: Border.all(color: KombeColors.line),
                  ),
                  child: Row(
                    children: <Widget>[
                      _TurnBadge(turn: focused),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(_statusLabel(focused.status).toUpperCase(), style: t.labelSmall),
                            const SizedBox(height: 2),
                            Text(focused.displayName, style: t.titleMedium),
                            Text(DateFormat.yMMMd(locale).format(focused.dueAtUtc.toLocal()), style: t.bodySmall),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
        ),
        const SizedBox(height: 24),
        Row(
          children: <Widget>[
            Expanded(child: Text('Ordre des bénéficiaires', style: t.titleLarge)),
            TextButton(onPressed: widget.onSeeAll, child: const Text('Voir tout')),
          ],
        ),
        const SizedBox(height: 4),
        for (final BeneficiaryTurn item in cycle.beneficiaries.take(6))
          Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: KombeColors.line))),
            child: Row(
              children: <Widget>[
                _TurnBadge(turn: item),
                const SizedBox(width: 12),
                Expanded(child: Text(item.displayName, style: t.titleSmall)),
                KombeStatusRing(status: _ring(item.status), label: _statusLabel(item.status)),
              ],
            ),
          ),
      ],
    );
  }
}

String _statusLabel(BeneficiaryStatus s) => switch (s) {
      BeneficiaryStatus.received => 'Reçu',
      BeneficiaryStatus.current => 'Tour en cours',
      BeneficiaryStatus.upcoming => 'À venir',
    };

KombeStatus _ring(BeneficiaryStatus s) => switch (s) {
      BeneficiaryStatus.received => KombeStatus.confirmed,
      BeneficiaryStatus.current => KombeStatus.pending,
      BeneficiaryStatus.upcoming => KombeStatus.draft,
    };

class _TurnBadge extends StatelessWidget {
  const _TurnBadge({required this.turn});
  final BeneficiaryTurn turn;

  @override
  Widget build(BuildContext context) {
    final bool current = turn.status == BeneficiaryStatus.current;
    final bool past = turn.status == BeneficiaryStatus.received;
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: current ? KombeColors.gold : past ? KombeColors.forest : Colors.white,
        border: Border.all(color: current || past ? Colors.transparent : KombeColors.lineStrong, width: 1.5),
      ),
      child: Text(
        '${turn.turnNumber}',
        style: TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: 13,
          color: past ? KombeColors.cream : KombeColors.ink,
          fontFeatures: const <FontFeature>[FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}
