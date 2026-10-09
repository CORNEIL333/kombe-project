import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/formatters/xaf.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import 'groups_view_models.dart';

/// Détail du groupe (maquette « Aperçu, membres, cycle et règles »).
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
    final String id = widget.groupId;
    return Scaffold(
      body: ListenableBuilder(
        listenable: vm,
        builder: (BuildContext context, Widget? child) => ResourceView<GroupDetails>(
          resource: vm.group,
          builder: (BuildContext context, GroupDetails details) => RefreshIndicator(
            onRefresh: vm.load,
            child: ListView(
              padding: EdgeInsets.zero,
              children: <Widget>[
                _Header(details: details, groupId: id),
                Transform.translate(
                  offset: const Offset(0, -34),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[
                        Row(
                          children: <Widget>[
                            _Action(icon: Icons.person_add_alt_1_outlined, label: 'Inviter', onTap: () => context.push('/app/groups/$id/invite')),
                            _Action(icon: Icons.calendar_month_outlined, label: 'Cycle', onTap: () => context.push('/app/groups/$id/cycle')),
                            _Action(icon: Icons.settings_outlined, label: 'Paramètres', onTap: () => context.push('/app/groups/$id/settings')),
                            _Action(icon: Icons.rule_rounded, label: 'Règles', onTap: () => context.push('/app/groups/$id/rules')),
                          ],
                        ),
                        const SizedBox(height: 16),
                        _StatsCard(group: details.summary),
                        const SizedBox(height: 18),
                        _Tabs(groupId: id),
                        const SizedBox(height: 14),
                        Row(
                          children: <Widget>[
                            Expanded(
                              child: Text(
                                'Membres du groupe (${details.summary.memberCount})',
                                style: Theme.of(context).textTheme.titleLarge,
                              ),
                            ),
                            TextButton(
                              onPressed: () => context.push('/app/groups/$id/members'),
                              style: TextButton.styleFrom(foregroundColor: KombeColors.goldDark),
                              child: const Text('Voir tout'),
                            ),
                          ],
                        ),
                        ResourceView<List<GroupMember>>(
                          resource: vm.members,
                          emptyWhen: (List<GroupMember> members) => members.isEmpty,
                          builder: (BuildContext context, List<GroupMember> members) => Column(
                            children: <Widget>[
                              for (final GroupMember m in members.take(5)) MemberRow(member: m, groupId: id),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.details, required this.groupId});
  final GroupDetails details;
  final String groupId;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final GroupSummary g = details.summary;
    final double top = MediaQuery.paddingOf(context).top;
    return PhotoBackdrop(
      asset: KombePhotos.coverFor(g.id),
      alignment: const Alignment(0, -.2),
      strength: .82,
      child: Padding(
        padding: EdgeInsets.fromLTRB(8, top + 4, 8, 58),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Row(
              children: <Widget>[
                IconButton(
                  tooltip: 'Retour',
                  color: Colors.white,
                  onPressed: () => context.canPop() ? context.pop() : context.go('/app/groups'),
                  icon: const Icon(Icons.arrow_back_ios_new_rounded),
                ),
                const Spacer(),
                IconButton(
                  tooltip: 'Paramètres du groupe',
                  color: Colors.white,
                  onPressed: () => context.push('/app/groups/$groupId/settings'),
                  icon: const Icon(Icons.more_horiz_rounded),
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: <Widget>[
                      Container(
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white, width: 3),
                        ),
                        child: CoverImage(groupId: g.id, url: g.coverUrl, width: 84, height: 84, radius: 17),
                      ),
                      const Spacer(),
                      CycleBadge(index: g.cycleIndex, total: g.cycleTotal),
                    ],
                  ),
                  const SizedBox(height: 14),
                  Text(
                    g.name,
                    style: t.headlineMedium?.copyWith(color: Colors.white, fontFamily: 'Fraunces', fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 4),
                  Text('${g.memberCount} membres', style: t.bodyLarge?.copyWith(color: Colors.white.withValues(alpha: .9))),
                  if (details.description.isNotEmpty) ...<Widget>[
                    const SizedBox(height: 10),
                    Text(
                      details.description,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: t.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: .9)),
                    ),
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

class _StatsCard extends StatelessWidget {
  const _StatsCard({required this.group});
  final GroupSummary group;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final double progress = group.cycleTotal == 0 ? 0 : (group.cycleIndex / group.cycleTotal).clamp(0, 1);
    Widget cell(IconData icon, String value, String label, {Widget? extra}) => Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Row(children: <Widget>[
                  Icon(icon, size: 18, color: KombeColors.emerald),
                  const SizedBox(width: 6),
                  Flexible(child: Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.titleSmall?.copyWith(fontSize: 15))),
                ]),
                const SizedBox(height: 4),
                Text(label, style: t.bodySmall),
                if (extra != null) ...<Widget>[const SizedBox(height: 6), extra],
              ],
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: KombeColors.line),
        boxShadow: const <BoxShadow>[BoxShadow(color: Color(0x14082C26), blurRadius: 18, offset: Offset(0, 8))],
      ),
      child: Column(
        children: <Widget>[
          Row(
            children: <Widget>[
              Container(
                width: 46,
                height: 46,
                decoration: const BoxDecoration(color: KombeColors.sand, shape: BoxShape.circle),
                child: const Icon(Icons.savings_rounded, color: KombeColors.goldDark),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text('Montant de la cotisation', style: t.bodySmall),
                    Text(Xaf.format(group.contributionAmountXaf), style: t.headlineSmall?.copyWith(fontSize: 22)),
                  ],
                ),
              ),
            ],
          ),
          const Divider(height: 26),
          IntrinsicHeight(
            child: Row(
              children: <Widget>[
                cell(Icons.groups_outlined, '${group.memberCount}', 'Membres'),
                const VerticalDivider(width: 1),
                cell(
                  Icons.donut_large_rounded,
                  '${group.cycleIndex}/${group.cycleTotal}',
                  'Cycle en cours',
                  extra: ClipRRect(borderRadius: BorderRadius.circular(99), child: LinearProgressIndicator(value: progress, minHeight: 5)),
                ),
                const VerticalDivider(width: 1),
                cell(Icons.calendar_month_outlined, DateFormat.MMMd(locale).format(group.nextDueAtUtc.toLocal()), 'Prochaine cotisation'),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Tabs extends StatelessWidget {
  const _Tabs({required this.groupId});
  final String groupId;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    Widget tab(String label, {bool active = false, VoidCallback? onTap}) => Expanded(
          child: Semantics(
            selected: active,
            button: true,
            child: InkWell(
              onTap: onTap,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(color: active ? KombeColors.forest : KombeColors.line, width: active ? 3 : 1)),
                ),
                alignment: Alignment.center,
                child: Text(label, style: t.titleSmall?.copyWith(color: active ? KombeColors.forest : KombeColors.slate)),
              ),
            ),
          ),
        );
    return Row(
      children: <Widget>[
        tab('Membres', active: true),
        tab('Cycle', onTap: () => context.push('/app/groups/$groupId/cycle')),
        tab('Règles', onTap: () => context.push('/app/groups/$groupId/rules')),
      ],
    );
  }
}

/// Ligne membre (maquette « Détail du groupe ») : avatar, nom, rôle, ancienneté.
class MemberRow extends StatelessWidget {
  const MemberRow({required this.member, required this.groupId, super.key});
  final GroupMember member;
  final String groupId;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String locale = Localizations.localeOf(context).toLanguageTag();
    return InkWell(
      onTap: () => context.push('/app/groups/$groupId/members/${member.identityId}'),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: KombeColors.line))),
        child: Row(
          children: <Widget>[
            KombeAvatar(name: member.displayName, url: member.avatarUrl, size: 52),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Wrap(
                    spacing: 8,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: <Widget>[
                      Text(member.displayName, style: t.titleMedium),
                      RoleChip(role: member.role),
                    ],
                  ),
                  const SizedBox(height: 3),
                  Text('Membre depuis ${DateFormat.yMMM(locale).format(member.joinedAtUtc.toLocal())}', style: t.bodySmall),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
          ],
        ),
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
  Widget build(BuildContext context) => Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Material(
            color: Colors.white,
            elevation: 3,
            shadowColor: const Color(0x33082C26),
            borderRadius: BorderRadius.circular(22),
            child: InkWell(
              onTap: onTap,
              borderRadius: BorderRadius.circular(22),
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 13),
                child: Column(
                  children: <Widget>[
                    Icon(icon, color: KombeColors.forest),
                    const SizedBox(height: 6),
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelMedium?.copyWith(color: KombeColors.ink, letterSpacing: 0),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
}
