import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../core/widgets/section_card.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import 'members_screen.dart';

/// Fiche d'un membre : ses fonctions ; la présidence peut lui proposer une
/// fonction du bureau (la personne doit l'accepter) ; la personne elle-même
/// accepte ici une fonction qui lui est proposée.
class MemberDetailScreen extends StatefulWidget {
  const MemberDetailScreen({
    required this.groupId,
    required this.identityId,
    super.key,
  });

  final String groupId;

  /// Identifiant d'adhésion (`membershipId`).
  final String identityId;

  @override
  State<MemberDetailScreen> createState() => _MemberDetailScreenState();
}

class _MemberDetailScreenState extends State<MemberDetailScreen> {
  Resource<GroupMember> _member = const ResourceLoading<GroupMember>();
  GroupSummary? _group;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final GroupRepository repo = context.read<GroupRepository>();
    final (Resource<GroupMember>, Resource<GroupDetails>) r =
        await (repo.getMember(widget.groupId, widget.identityId), repo.getGroup(widget.groupId)).wait;
    if (!mounted) return;
    setState(() {
      _member = r.$1;
      if (r.$2 case ResourceReady<GroupDetails>(:final GroupDetails data)) _group = data.summary;
    });
  }

  Future<void> _run(Future<OperationResult<void>> Function(GroupRepository repo) action, String done) async {
    setState(() => _busy = true);
    final OperationResult<void> r = await action(context.read<GroupRepository>());
    if (!mounted) return;
    setState(() => _busy = false);
    if (reportOutcome(context, r)) {
      showKombeMessage(context, done);
      await _load();
    }
  }

  Future<void> _propose(GroupMember m) async {
    final String? role = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (BuildContext context) => SafeArea(
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          children: <Widget>[
            Text('Proposer une fonction à ${m.displayName}', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            const Text('La personne la reçoit en notification et doit l’accepter.'),
            for (final String r in bureauRoles.where((String r) => !m.apiRoles.contains(r)))
              ListTile(
                title: Text(apiRoleLabel(r)),
                trailing: m.pendingRoles.contains(r) ? const Text('déjà proposée') : null,
                onTap: () => Navigator.of(context).pop(r),
              ),
          ],
        ),
      ),
    );
    if (role == null || !mounted) return;
    await _run(
      (GroupRepository repo) => repo.proposeRole(groupId: widget.groupId, membershipId: m.identityId, role: role),
      'Fonction de ${apiRoleLabel(role)} proposée à ${m.displayName}.',
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Membre')),
        body: ResourceView<GroupMember>(
          resource: _member,
          builder: (BuildContext context, GroupMember member) {
            final TextTheme t = Theme.of(context).textTheme;
            final bool canAssign =
                (_group?.can(TontineAct.assignRole) ?? false) && !member.pending && !member.offline;
            return ListView(
              padding: const EdgeInsets.all(20),
              children: <Widget>[
                Center(child: KombeAvatar(name: member.displayName, size: 84)),
                const SizedBox(height: 16),
                Text(member.displayName, textAlign: TextAlign.center, style: t.headlineMedium),
                const SizedBox(height: 6),
                Text(memberRolesLabel(member), textAlign: TextAlign.center, style: t.bodyLarge),
                const SizedBox(height: 24),
                SectionCard(
                  child: Column(
                    children: <Widget>[
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.badge_outlined),
                        title: const Text('Fonctions'),
                        subtitle: Text(memberRolesLabel(member)),
                      ),
                      if (member.pendingRoles.isNotEmpty) ...<Widget>[
                        const Divider(),
                        ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: const Icon(Icons.hourglass_top_rounded),
                          title: const Text('Proposée, pas encore acceptée'),
                          subtitle: Text(member.pendingRoles.map(apiRoleLabel).join(', ')),
                        ),
                      ],
                      const Divider(),
                      ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.calendar_today_outlined),
                        title: Text(member.pending ? 'Demande d’adhésion' : 'Membre depuis'),
                        trailing: Text(
                          member.pending
                              ? 'en attente'
                              : DateFormat.yMMMd(Localizations.localeOf(context).toLanguageTag()).format(member.joinedAtUtc.toLocal()),
                        ),
                      ),
                    ],
                  ),
                ),
                if (member.isMe)
                  for (final String role in member.pendingRoles) ...<Widget>[
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: _busy
                          ? null
                          : () => _run(
                                (GroupRepository repo) => repo.acceptRole(groupId: widget.groupId, role: role),
                                'Vous êtes désormais ${apiRoleLabel(role)}.',
                              ),
                      child: Text('Accepter la fonction de ${apiRoleLabel(role)}'),
                    ),
                  ],
                if (canAssign) ...<Widget>[
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => _propose(member),
                    icon: const Icon(Icons.manage_accounts_outlined),
                    label: const Text('Proposer une fonction'),
                  ),
                ],
                if (member.offline) ...<Widget>[
                  const SizedBox(height: 12),
                  Text('Membre sans téléphone, représenté par un proche : il ne tient pas de fonction du bureau.', style: t.bodySmall),
                ],
              ],
            );
          },
        ),
      );
}
