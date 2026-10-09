import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/labels.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/repositories/group_repository.dart';
import 'groups_view_models.dart';

class BeneficiariesScreen extends StatefulWidget {
  const BeneficiariesScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<BeneficiariesScreen> createState() => _BeneficiariesScreenState();
}

class _BeneficiariesScreenState extends State<BeneficiariesScreen> {
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
        appBar: AppBar(title: const Text('Ordre des bénéficiaires')),
        body: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) =>
              ResourceView<CycleDetails>(
            resource: _vm!.state,
            builder: (BuildContext context, CycleDetails cycle) => ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: cycle.beneficiaries.length,
              separatorBuilder: (_, __) => const Divider(),
              itemBuilder: (BuildContext context, int index) {
                final BeneficiaryTurn item = cycle.beneficiaries[index];
                return ListTile(
                  minTileHeight: 68,
                  leading: CircleAvatar(child: Text('${item.turnNumber}')),
                  title: Text(item.displayName),
                  subtitle: Text(
                    DateFormat.yMMMd(
                      Localizations.localeOf(context).toLanguageTag(),
                    ).format(item.dueAtUtc.toLocal()),
                  ),
                  trailing: Text(KombeLabels.beneficiaryStatus(item.status)),
                );
              },
            ),
          ),
        ),
      );
}
