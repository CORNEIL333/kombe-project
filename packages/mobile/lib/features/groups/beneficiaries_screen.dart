import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/labels.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/kombe_visuals.dart';
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
            onRetry: _vm!.load,
            emptyWhen: (CycleDetails c) => c.beneficiaries.isEmpty,
            emptyTitle: 'Ordre pas encore fixé',
            emptyBody: 'L’ordre des bénéficiaires apparaîtra quand le cycle sera démarré.',
            builder: (BuildContext context, CycleDetails cycle) => ListView(
              padding: const EdgeInsets.only(top: 8, bottom: 32),
              children: <Widget>[
                KombeGroupedList(
                  children: <Widget>[
                    for (final BeneficiaryTurn item in cycle.beneficiaries)
                      ListTile(
                        minTileHeight: 72,
                        tileColor: item.status == BeneficiaryStatus.current ? KombeColors.goldPale.withValues(alpha: .45) : null,
                        leading: SizedBox(
                          width: 76,
                          child: Row(
                            children: <Widget>[
                              SizedBox(
                                width: 26,
                                child: Text('${item.turnNumber}', style: KombeType.amount(size: 18, color: KombeColors.slate)),
                              ),
                              KombeAvatar(name: item.displayName, url: item.avatarUrl, size: 42),
                            ],
                          ),
                        ),
                        title: Text(item.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
                        subtitle: Text(DateFormat.yMMMd(Localizations.localeOf(context).toLanguageTag()).format(item.dueAtUtc.toLocal())),
                        trailing: StatusPill(
                          KombeLabels.beneficiaryStatus(item.status),
                          tone: switch (item.status) {
                            BeneficiaryStatus.received => KombeTone.success,
                            BeneficiaryStatus.current => KombeTone.money,
                            BeneficiaryStatus.upcoming => KombeTone.neutral,
                          },
                          icon: item.status == BeneficiaryStatus.received ? Icons.check_rounded : null,
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
}
