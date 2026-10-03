import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
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
          builder: (BuildContext context, Widget? child) =>
              ResourceView<CycleDetails>(
            resource: _vm!.state,
            builder: (BuildContext context, CycleDetails cycle) => ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                Row(
                  children: <Widget>[
                    Text('Progression du cycle', style: Theme.of(context).textTheme.titleLarge),
                    const Spacer(),
                    Text('${cycle.currentTurn}/${cycle.totalTurns} tours'),
                  ],
                ),
                const SizedBox(height: 12),
                LinearProgressIndicator(
                  value: cycle.totalTurns == 0 ? 0 : cycle.currentTurn / cycle.totalTurns,
                  minHeight: 9,
                  borderRadius: BorderRadius.circular(99),
                ),
                const SizedBox(height: 22),
                finalCurrentBeneficiary(cycle, context),
                const SizedBox(height: 20),
                Row(
                  children: <Widget>[
                    Text('Ordre des bénéficiaires', style: Theme.of(context).textTheme.titleLarge),
                    const Spacer(),
                    TextButton(
                      onPressed: () => context.push('/app/groups/${widget.groupId}/beneficiaries'),
                      child: const Text('Voir tout'),
                    ),
                  ],
                ),
                SectionCard(
                  child: Column(
                    children: <Widget>[
                      for (final BeneficiaryTurn item in cycle.beneficiaries.take(5))
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: CircleAvatar(child: Text('${item.turnNumber}')),
                          title: Text(item.displayName),
                          trailing: Text(item.status.name),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );

  Widget finalCurrentBeneficiary(CycleDetails cycle, BuildContext context) {
    BeneficiaryTurn? current;
    for (final BeneficiaryTurn item in cycle.beneficiaries) {
      if (item.status == BeneficiaryStatus.current) {
        current = item;
        break;
      }
    }
    if (current == null) {
      return const SizedBox.shrink();
    }
    return SectionCard(
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: const CircleAvatar(
          backgroundColor: KombeColors.mint,
          foregroundColor: KombeColors.forest,
          child: Icon(Icons.workspace_premium_outlined),
        ),
        title: Text('Bénéficiaire actuel — Tour ${current.turnNumber}'),
        subtitle: Text(current.displayName),
      ),
    );
  }
}
