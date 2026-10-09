import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/labels.dart';
import '../../core/widgets/group_hero_card.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import 'groups_view_models.dart';

class GroupDetailScreen extends StatefulWidget {
  const GroupDetailScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<GroupDetailScreen> createState() => _GroupDetailScreenState();
}

class _GroupDetailScreenState extends State<GroupDetailScreen> {
  GroupDetailViewModel? _vm;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _vm ??= GroupDetailViewModel(context.read<GroupRepository>(), widget.groupId)..load();
  }

  @override
  void dispose() {
    _vm?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final GroupDetailViewModel vm = _vm!;
    return Scaffold(
      appBar: AppBar(actions: <Widget>[
        IconButton(
          tooltip: 'Paramètres',
          onPressed: () => context.push('/app/groups/${widget.groupId}/settings'),
          icon: const Icon(Icons.more_horiz),
        ),
      ]),
      body: ListenableBuilder(
        listenable: vm,
        builder: (BuildContext context, Widget? child) {
          return ResourceView<GroupDetails>(
            resource: vm.group,
            builder: (BuildContext context, GroupDetails details) => RefreshIndicator(
              onRefresh: vm.load,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
                children: <Widget>[
                  GroupHeroCard(group: details.summary),
                  const SizedBox(height: 16),
                  Row(
                    children: <Widget>[
                      Expanded(
                        child: _Action(
                          icon: Icons.person_add_alt_1_outlined,
                          label: 'Inviter',
                          onTap: () => context.push('/app/groups/${widget.groupId}/invite'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _Action(
                          icon: Icons.calendar_month_outlined,
                          label: 'Cycle',
                          onTap: () => context.push('/app/groups/${widget.groupId}/cycle'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _Action(
                          icon: Icons.rule_outlined,
                          label: 'Règles',
                          onTap: () => context.push('/app/groups/${widget.groupId}/rules'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  SectionCard(
                    child: Text(
                      details.description,
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    children: <Widget>[
                      Text('Membres', style: Theme.of(context).textTheme.titleLarge),
                      const Spacer(),
                      TextButton(
                        onPressed: () => context.push('/app/groups/${widget.groupId}/members'),
                        child: const Text('Voir tout'),
                      ),
                    ],
                  ),
                  ResourceView<List<GroupMember>>(
                    resource: vm.members,
                    emptyWhen: (List<GroupMember> members) => members.isEmpty,
                    builder: (BuildContext context, List<GroupMember> members) => SectionCard(
                      child: Column(
                        children: <Widget>[
                          for (final GroupMember member in members.take(4))
                            ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: const CircleAvatar(
                                backgroundColor: KombeColors.mint,
                                foregroundColor: KombeColors.forest,
                                child: Icon(Icons.person_outline),
                              ),
                              title: Text(member.displayName),
                              subtitle: Text(KombeLabels.role(member.role)),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => context.push(
                                '/app/groups/${widget.groupId}/members/${member.identityId}',
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _Action extends StatelessWidget {
  const _Action({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border.all(color: KombeColors.line),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Column(
            children: <Widget>[
              Icon(icon, color: KombeColors.forest),
              const SizedBox(height: 6),
              Text(label, style: Theme.of(context).textTheme.labelMedium),
            ],
          ),
        ),
      );
}
