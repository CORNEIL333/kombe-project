import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/formatters/labels.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/operation_feedback.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import '../../l10n/app_localizations.dart';
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
            Text(AppLocalizations.of(context).mdProposerUneFonction(m.displayName), style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(AppLocalizations.of(context).mdLaPersonneLaRecoitEn),
            for (final String r in bureauRoles.where((String r) => !m.apiRoles.contains(r)))
              ListTile(
                title: Text(apiRoleLabel(r)),
                trailing: m.pendingRoles.contains(r) ? Text(AppLocalizations.of(context).mdDejaProposee) : null,
                onTap: () => Navigator.of(context).pop(r),
              ),
          ],
        ),
      ),
    );
    if (role == null || !mounted) return;
    await _run(
      (GroupRepository repo) => repo.proposeRole(groupId: widget.groupId, membershipId: m.identityId, role: role),
      AppLocalizations.of(context).mdFonctionDeProposee(apiRoleLabel(role), m.displayName),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).roleMemberLabel)),
        body: ResourceView<GroupMember>(
          resource: _member,
          onRetry: _load,
          builder: (BuildContext context, GroupMember member) {
            final TextTheme t = Theme.of(context).textTheme;
            final bool canAssign =
                (_group?.can(TontineAct.assignRole) ?? false) && !member.pending && !member.offline;
            final bool bureau = member.apiRoles.isNotEmpty;
            return ListView(
              padding: const EdgeInsets.fromLTRB(0, 16, 0, 32),
              children: <Widget>[
                Center(
                  child: MemberAvatar(
                    groupId: widget.groupId,
                    memberId: member.identityId,
                    name: member.displayName,
                    photoVersion: member.photoVersion,
                    size: 112,
                  ),
                ),
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Text(member.displayName, textAlign: TextAlign.center, style: t.headlineMedium),
                ),
                const SizedBox(height: 8),
                Center(
                  child: StatusPill(
                    member.pending ? AppLocalizations.of(context).mdDemandeEnAttente : memberRolesLabel(member),
                    tone: bureau ? KombeTone.money : KombeTone.brand,
                    icon: bureau ? Icons.star_rounded : Icons.person_outline_rounded,
                  ),
                ),
                const SizedBox(height: 24),
                KombeGroupedList(
                  children: <Widget>[
                    KombeFact(icon: Icons.badge_outlined, label: AppLocalizations.of(context).mdFonctions, value: memberRolesLabel(member)),
                    if (member.pendingRoles.isNotEmpty)
                      KombeFact(
                        icon: Icons.hourglass_top_rounded,
                        label: AppLocalizations.of(context).mdProposeePasEncoreAcceptee,
                        value: member.pendingRoles.map(apiRoleLabel).join(', '),
                      ),
                    KombeFact(
                      icon: Icons.event_available_outlined,
                      label: member.pending ? AppLocalizations.of(context).mdDemandeDadhesion : AppLocalizations.of(context).mdMembreDepuis,
                      value: member.pending
                          ? AppLocalizations.of(context).mdEnAttente
                          : DateFormat.yMMMd(Localizations.localeOf(context).toLanguageTag()).format(member.joinedAtUtc.toLocal()),
                    ),
                  ],
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      if (member.isMe)
                        for (final String role in member.pendingRoles) ...<Widget>[
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: _busy
                                ? null
                                : () => _run(
                                      (GroupRepository repo) => repo.acceptRole(groupId: widget.groupId, role: role),
                                      AppLocalizations.of(context).mdVousEtesDesormais(apiRoleLabel(role)),
                                    ),
                            child: Text(AppLocalizations.of(context).mdAccepterLaFonctionDe(apiRoleLabel(role))),
                          ),
                        ],
                      if (canAssign) ...<Widget>[
                        const SizedBox(height: 16),
                        OutlinedButton.icon(
                          onPressed: _busy ? null : () => _propose(member),
                          icon: const Icon(Icons.manage_accounts_outlined),
                          label: Text(AppLocalizations.of(context).mdProposerUneFonction2),
                        ),
                      ],
                      if (member.offline) ...<Widget>[
                        const SizedBox(height: 12),
                        Text(AppLocalizations.of(context).mdMembreSansTelephoneRepresentePar, style: t.bodySmall),
                      ],
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      );
}
