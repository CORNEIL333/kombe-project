import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import 'groups_view_models.dart';

class MembersScreen extends StatefulWidget {
  const MembersScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<MembersScreen> createState() => _MembersScreenState();
}

class _MembersScreenState extends State<MembersScreen> {
  MembersViewModel? _vm;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _vm ??= MembersViewModel(context.read<GroupRepository>(), widget.groupId)..load();
  }

  @override
  void dispose() {
    _vm?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Membres')),
        body: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) =>
              ResourceView<List<GroupMember>>(
            resource: _vm!.state,
            emptyWhen: (List<GroupMember> data) => data.isEmpty,
            builder: (BuildContext context, List<GroupMember> members) => ListView.separated(
              padding: const EdgeInsets.all(20),
              itemCount: members.length,
              separatorBuilder: (_, __) => const Divider(),
              itemBuilder: (BuildContext context, int index) {
                final GroupMember member = members[index];
                return ListTile(
                  minTileHeight: 70,
                  leading: const CircleAvatar(
                    backgroundColor: KombeColors.mint,
                    foregroundColor: KombeColors.forest,
                    child: Icon(Icons.person_outline),
                  ),
                  title: Text(member.displayName),
                  subtitle: Text(member.role.name),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => context.push(
                    '/app/groups/${widget.groupId}/members/${member.identityId}',
                  ),
                );
              },
            ),
          ),
        ),
      );
}
