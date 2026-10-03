import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import '../../l10n/app_localizations.dart';
import 'groups_view_models.dart';

class GroupsScreen extends StatefulWidget {
  const GroupsScreen({super.key});

  @override
  State<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends State<GroupsScreen> {
  GroupsViewModel? _viewModel;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _viewModel ??= GroupsViewModel(context.read<GroupRepository>())..load();
  }

  @override
  void dispose() {
    _viewModel?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final GroupsViewModel vm = _viewModel!;
    final AppLocalizations l10n = AppLocalizations.of(context);
    return ListenableBuilder(
      listenable: vm,
      builder: (BuildContext context, Widget? child) => RefreshIndicator(
        onRefresh: vm.load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 100),
          children: <Widget>[
            Row(
              children: <Widget>[
                const KombeLogo(size: 44),
                const Spacer(),
                IconButton(
                  tooltip: l10n.notifications,
                  onPressed: () => context.go('/app/notifications'),
                  icon: const Icon(Icons.notifications_none),
                ),
              ],
            ),
            const SizedBox(height: 28),
            Text(l10n.myGroups, style: Theme.of(context).textTheme.headlineLarge),
            const SizedBox(height: 6),
            Text(
              'Retrouvez et gérez vos groupes de tontine.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => context.push('/app/groups/join'),
              icon: const Icon(Icons.add),
              label: Text(l10n.joinGroup),
            ),
            const SizedBox(height: 16),
            ResourceView<List<GroupSummary>>(
              resource: vm.state,
              emptyWhen: (List<GroupSummary> groups) => groups.isEmpty,
              emptyTitle: l10n.emptyGroups,
              builder: (BuildContext context, List<GroupSummary> groups) => Column(
                children: <Widget>[
                  for (final GroupSummary group in groups) ...<Widget>[
                    _GroupListCard(group: group),
                    const SizedBox(height: 12),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupListCard extends StatelessWidget {
  const _GroupListCard({required this.group});
  final GroupSummary group;

  @override
  Widget build(BuildContext context) {
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final double progress =
        group.cycleTotal == 0 ? 0 : group.cycleIndex / group.cycleTotal;
    return SectionCard(
      child: InkWell(
        onTap: () => context.push('/app/groups/${group.id}'),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  const CircleAvatar(
                    backgroundColor: KombeColors.mint,
                    foregroundColor: KombeColors.forest,
                    child: Icon(Icons.groups_2_outlined),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      group.name,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                  ),
                  const Icon(Icons.chevron_right),
                ],
              ),
              const SizedBox(height: 12),
              Text('${group.memberCount} membres • ${group.role.name}'),
              const SizedBox(height: 10),
              Row(
                children: <Widget>[
                  Text('Cycle ${group.cycleIndex}/${group.cycleTotal}'),
                  const Spacer(),
                  Text('${(progress * 100).round()}%'),
                ],
              ),
              const SizedBox(height: 6),
              LinearProgressIndicator(
                value: progress.clamp(0, 1),
                minHeight: 6,
                borderRadius: BorderRadius.circular(99),
              ),
              const SizedBox(height: 12),
              Row(
                children: <Widget>[
                  const Icon(Icons.calendar_month_outlined, size: 18, color: KombeColors.goldDark),
                  const SizedBox(width: 8),
                  Text('Prochaine cotisation : ${DateFormat.yMMMd(locale).format(group.nextDueAtUtc.toLocal())}'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
