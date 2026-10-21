import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/labels.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Libellé des fonctions d'un membre (fonctions API si connues).
String memberRolesLabel(GroupMember m) =>
    m.apiRoles.isEmpty ? KombeLabels.role(m.role) : m.apiRoles.map(apiRoleLabel).join(', ');

/// Membres du groupe, demandes d'adhésion à examiner (président,
/// vice-président) et fonctions qui me sont proposées.
class MembersScreen extends StatefulWidget {
  const MembersScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<MembersScreen> createState() => _MembersScreenState();
}

class _MembersScreenState extends State<MembersScreen> {
  Resource<List<GroupMember>> _members = const ResourceLoading<List<GroupMember>>();
  GroupSummary? _group;
  final Set<String> _busy = <String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final GroupRepository repo = context.read<GroupRepository>();
    final (Resource<List<GroupMember>>, Resource<GroupDetails>) r = await (repo.listMembers(widget.groupId), repo.getGroup(widget.groupId)).wait;
    if (!mounted) return;
    setState(() {
      _members = r.$1;
      if (r.$2 case ResourceReady<GroupDetails>(:final GroupDetails data)) _group = data.summary;
    });
  }

  Future<void> _run(String key, Future<OperationResult<void>> Function(GroupRepository repo) action, String done) async {
    setState(() => _busy.add(key));
    final OperationResult<void> r = await action(context.read<GroupRepository>());
    if (!mounted) return;
    setState(() => _busy.remove(key));
    if (reportOutcome(context, r)) {
      showKombeMessage(context, done);
      await _load();
    }
  }

  void _admit(GroupMember m, bool admit) => _run(
        m.identityId,
        (GroupRepository repo) => repo.decideAdmission(groupId: widget.groupId, membershipId: m.identityId, admit: admit),
        admit ? '${m.displayName} est admis(e) dans le groupe.' : 'Demande de ${m.displayName} refusée.',
      );

  void _acceptRole(String role) => _run(
        'role:$role',
        (GroupRepository repo) => repo.acceptRole(groupId: widget.groupId, role: role),
        'Vous êtes désormais ${apiRoleLabel(role)}.',
      );

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Membres')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<GroupMember>>(
            resource: _members,
            emptyWhen: (List<GroupMember> data) => data.isEmpty,
            builder: (BuildContext context, List<GroupMember> members) {
              final TextTheme t = Theme.of(context).textTheme;
              final List<GroupMember> pending = members.where((GroupMember m) => m.pending).toList();
              final List<GroupMember> active = members.where((GroupMember m) => !m.pending).toList();
              final GroupMember? me = members.where((GroupMember m) => m.isMe).firstOrNull;
              final bool canAdmit = _group?.can(TontineAct.admit) ?? false;
              return ListView(
                padding: const EdgeInsets.all(20),
                children: <Widget>[
                  if (me != null && me.pendingRoles.isNotEmpty) ...<Widget>[
                    for (final String role in me.pendingRoles)
                      Container(
                        margin: const EdgeInsets.only(bottom: 12),
                        padding: const EdgeInsets.all(16),
                        decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(16)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text('On vous propose la fonction de ${apiRoleLabel(role)}', style: t.titleMedium),
                            const SizedBox(height: 6),
                            const Text('Vous n’exercez cette fonction qu’après l’avoir acceptée.'),
                            const SizedBox(height: 10),
                            FilledButton(
                              onPressed: _busy.contains('role:$role') ? null : () => _acceptRole(role),
                              child: const Text('Accepter la fonction'),
                            ),
                          ],
                        ),
                      ),
                  ],
                  if (pending.isNotEmpty) ...<Widget>[
                    Text('Demandes d’adhésion (${pending.length})', style: t.titleLarge),
                    const SizedBox(height: 4),
                    Text(
                      canAdmit
                          ? 'Admettez les personnes que vous connaissez ; refusez les autres.'
                          : 'Le président ou le vice-président examine ces demandes.',
                      style: t.bodySmall,
                    ),
                    for (final GroupMember m in pending)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        child: Row(
                          children: <Widget>[
                            KombeAvatar(name: m.displayName, size: 44),
                            const SizedBox(width: 12),
                            Expanded(child: Text(m.displayName, style: t.titleSmall)),
                            if (canAdmit && !_busy.contains(m.identityId)) ...<Widget>[
                              TextButton(onPressed: () => _admit(m, false), child: const Text('Refuser')),
                              FilledButton(onPressed: () => _admit(m, true), child: const Text('Admettre')),
                            ] else if (_busy.contains(m.identityId))
                              const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                            else
                              const KombeChip(label: 'En attente', tone: ChipTone.neutral),
                          ],
                        ),
                      ),
                    const Divider(height: 28),
                  ],
                  Text('Membres (${active.length})', style: t.titleLarge),
                  for (final GroupMember m in active)
                    ListTile(
                      minTileHeight: 64,
                      contentPadding: EdgeInsets.zero,
                      leading: KombeAvatar(name: m.displayName, size: 44),
                      title: Text(m.isMe ? '${m.displayName} (vous)' : m.displayName),
                      subtitle: Text(
                        m.pendingRoles.isEmpty
                            ? memberRolesLabel(m)
                            : '${memberRolesLabel(m)} · proposé(e) ${m.pendingRoles.map(apiRoleLabel).join(', ')}',
                      ),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () async {
                        await context.push('/app/groups/${widget.groupId}/members/${m.identityId}');
                        if (mounted) await _load();
                      },
                    ),
                ],
              );
            },
          ),
        ),
      );
}
