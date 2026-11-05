import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/labels.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/kombe_components.dart';
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

  String _query = '';

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

  Future<void> _open(GroupMember m) async {
    await context.push('/app/groups/${widget.groupId}/members/${Uri.encodeComponent(m.identityId)}');
    if (mounted) await _load();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Membres')),
        body: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<GroupMember>>(
            resource: _members,
            onRetry: _load,
            emptyWhen: (List<GroupMember> data) => data.isEmpty,
            emptyTitle: 'Aucun membre',
            emptyBody: 'Les membres apparaîtront ici dès leur adhésion.',
            builder: (BuildContext context, List<GroupMember> members) {
              final TextTheme t = Theme.of(context).textTheme;
              final List<GroupMember> pending = members.where((GroupMember m) => m.pending).toList();
              final List<GroupMember> active = members.where((GroupMember m) => !m.pending).toList();
              final GroupMember? me = members.where((GroupMember m) => m.isMe).firstOrNull;
              final bool canAdmit = _group?.can(TontineAct.admit) ?? false;
              final String q = _query.trim().toLowerCase();
              final List<GroupMember> shown =
                  q.isEmpty ? active : active.where((GroupMember m) => m.displayName.toLowerCase().contains(q)).toList();
              // Le bureau d'abord (fonction), puis les membres, chacun par ordre alphabétique.
              int byName(GroupMember a, GroupMember b) => a.displayName.compareTo(b.displayName);
              final List<GroupMember> office = shown.where(_inOffice).toList()..sort(byName);
              final List<GroupMember> others = shown.where((GroupMember m) => !_inOffice(m)).toList()..sort(byName);
              final int officeCount = active.where(_inOffice).length;
              return ListView(
                padding: const EdgeInsets.only(bottom: 32),
                children: <Widget>[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                    child: Text.rich(
                      TextSpan(
                        children: <InlineSpan>[
                          TextSpan(text: '${active.length}', style: KombeType.amount(size: 30)),
                          TextSpan(
                            text: '  membre${active.length > 1 ? 's' : ''} · $officeCount au bureau',
                            style: t.bodyLarge?.copyWith(color: KombeColors.slate),
                          ),
                        ],
                      ),
                    ),
                  ),
                  if (me != null && me.pendingRoles.isNotEmpty)
                    for (final String role in me.pendingRoles)
                      Padding(
                        padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                        child: Container(
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(color: KombeColors.mint, borderRadius: BorderRadius.circular(KombeSpacing.tileRadius)),
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
                      ),
                  if (pending.isNotEmpty) ...<Widget>[
                    KombeSection('Demandes d’adhésion (${pending.length})'),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
                      child: Text(
                        canAdmit
                            ? 'Admettez les personnes que vous connaissez ; refusez les autres.'
                            : 'Le président ou le vice-président examine ces demandes.',
                        style: t.bodySmall,
                      ),
                    ),
                    KombeGroupedList(
                      children: <Widget>[
                        for (final GroupMember m in pending)
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                            child: Row(
                              children: <Widget>[
                                MemberAvatar(groupId: widget.groupId, memberId: m.identityId, name: m.displayName, photoVersion: m.photoVersion, size: 42),
                                const SizedBox(width: 12),
                                Expanded(child: Text(m.displayName, maxLines: 2, overflow: TextOverflow.ellipsis, style: t.titleSmall)),
                                if (canAdmit && !_busy.contains(m.identityId)) ...<Widget>[
                                  TextButton(onPressed: () => _admit(m, false), child: const Text('Refuser')),
                                  FilledButton(onPressed: () => _admit(m, true), child: const Text('Admettre')),
                                ] else if (_busy.contains(m.identityId))
                                  const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
                                else
                                  const StatusPill('En attente'),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ],
                  if (active.length > 8)
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
                    KombeGroupedList(
                      children: <Widget>[for (final GroupMember m in office) _MemberRow(member: m, groupId: widget.groupId, onTap: () => _open(m))],
                    ),
                  ],
                  if (others.isNotEmpty) ...<Widget>[
                    const KombeSection('Membres'),
                    KombeGroupedList(
                      children: <Widget>[for (final GroupMember m in others) _MemberRow(member: m, groupId: widget.groupId, onTap: () => _open(m))],
                    ),
                  ],
                  if (office.isEmpty && others.isEmpty && q.isNotEmpty)
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

/// Tient une fonction au bureau (fonctions API, sinon rôle principal).
bool _inOffice(GroupMember m) => m.apiRoles.isNotEmpty || m.role != GroupRole.member;

class _MemberRow extends StatelessWidget {
  const _MemberRow({required this.member, required this.groupId, required this.onTap});
  final GroupMember member;
  final String groupId;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bool office = _inOffice(member);
    final String? proposed = member.pendingRoles.isEmpty ? null : 'proposé(e) ${member.pendingRoles.map(apiRoleLabel).join(', ')}';
    final String? since = office
        ? null
        : 'Depuis ${DateFormat('MMMM y', Localizations.localeOf(context).toLanguageTag()).format(member.joinedAtUtc.toLocal())}';
    final String subtitle = <String?>[since, proposed].whereType<String>().join(' · ');
    return ListTile(
      minTileHeight: 66,
      leading: MemberAvatar(groupId: groupId, memberId: member.identityId, name: member.displayName, photoVersion: member.photoVersion, size: 42),
      title: Text(member.isMe ? '${member.displayName} (vous)' : member.displayName, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: subtitle.isEmpty ? null : Text(subtitle),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (office) ConstrainedBox(constraints: const BoxConstraints(maxWidth: 150), child: StatusPill(memberRolesLabel(member), tone: KombeTone.money)),
          const SizedBox(width: 4),
          const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
        ],
      ),
      onTap: onTap,
    );
  }
}
