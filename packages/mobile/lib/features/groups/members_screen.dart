import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/labels.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/kombe_visuals.dart';
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

  String _query = '';

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Membres')),
        body: ListenableBuilder(
          listenable: _vm!,
          builder: (BuildContext context, Widget? child) => ResourceView<List<GroupMember>>(
            resource: _vm!.state,
            emptyWhen: (List<GroupMember> data) => data.isEmpty,
            emptyTitle: 'Aucun membre',
            emptyBody: 'Les membres apparaîtront ici dès leur adhésion.',
            builder: (BuildContext context, List<GroupMember> members) {
              final String q = _query.trim().toLowerCase();
              final List<GroupMember> shown =
                  q.isEmpty ? members : members.where((GroupMember m) => m.displayName.toLowerCase().contains(q)).toList();
              // Le bureau d'abord (fonction), puis les membres, chacun par ordre alphabétique.
              int byName(GroupMember a, GroupMember b) => a.displayName.compareTo(b.displayName);
              final List<GroupMember> office = shown.where((GroupMember m) => m.role != GroupRole.member).toList()..sort(byName);
              final List<GroupMember> others = shown.where((GroupMember m) => m.role == GroupRole.member).toList()..sort(byName);
              final int officeCount = members.where((GroupMember m) => m.role != GroupRole.member).length;
              return ListView(
                padding: const EdgeInsets.only(bottom: 32),
                children: <Widget>[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                    child: Text.rich(
                      TextSpan(
                        children: <InlineSpan>[
                          TextSpan(text: '${members.length}', style: KombeType.amount(size: 30)),
                          TextSpan(
                            text: '  membre${members.length > 1 ? 's' : ''} · $officeCount au bureau',
                            style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: KombeColors.slate),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (members.length > 8)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                      child: TextField(
                        onChanged: (String v) => setState(() => _query = v),
                        textInputAction: TextInputAction.search,
                        decoration: const InputDecoration(
                          hintText: 'Rechercher un membre',
                          prefixIcon: Icon(Icons.search_rounded),
                        ),
                      ),
                    ),
                  if (office.isNotEmpty) ...<Widget>[
                    const KombeSection('Bureau'),
                    KombeGroupedList(children: <Widget>[for (final GroupMember m in office) _MemberRow(member: m, groupId: widget.groupId)]),
                  ],
                  if (others.isNotEmpty) ...<Widget>[
                    const KombeSection('Membres'),
                    KombeGroupedList(children: <Widget>[for (final GroupMember m in others) _MemberRow(member: m, groupId: widget.groupId)]),
                  ],
                  if (office.isEmpty && others.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('Aucun membre ne correspond à cette recherche.', textAlign: TextAlign.center),
                    ),
                ],
              );
            },
          ),
        ),
      );
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({required this.member, required this.groupId});
  final GroupMember member;
  final String groupId;

  @override
  Widget build(BuildContext context) => ListTile(
        minTileHeight: 66,
        leading: KombeAvatar(name: member.displayName, url: member.avatarUrl, size: 42),
        title: Text(member.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: member.role == GroupRole.member ? Text('Depuis ${DateFormat('MMMM y', Localizations.localeOf(context).toLanguageTag()).format(member.joinedAtUtc.toLocal())}') : null,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (member.role != GroupRole.member) StatusPill(KombeLabels.role(member.role), tone: KombeTone.money),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
          ],
        ),
        onTap: () => context.push('/app/groups/$groupId/members/${Uri.encodeComponent(member.identityId)}'),
      );
}
