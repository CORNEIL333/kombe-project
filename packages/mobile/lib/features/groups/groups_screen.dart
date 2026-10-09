import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import '../../l10n/app_localizations.dart';
import 'groups_view_models.dart';

/// Carte d'action d'amorçage (créer / rejoindre / découvrir) — ligne tactile
/// pleine largeur alignée sur la charte (icône + libellé + chevron).
class _OnboardingAction extends StatelessWidget {
  const _OnboardingAction({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: OutlinedButton.icon(
        style: OutlinedButton.styleFrom(
          alignment: AlignmentDirectional.centerStart,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
        ),
        onPressed: onTap,
        icon: Icon(icon, color: KombeColors.forest),
        label: Text(label, style: Theme.of(context).textTheme.titleSmall),
      ),
    );
  }
}

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
            Text(l10n.myGroups, style: Theme.of(context).textTheme.displaySmall),
            const SizedBox(height: 6),
            Text(
              'Retrouvez et gérez vos groupes de tontine.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: 20),
            // Amorçage complet (C03) : créer / rejoindre par code / découvrir
            // (avec parrainage). Le parcours ne proposait que « rejoindre ».
            _OnboardingAction(
              icon: Icons.add_circle_outline,
              label: 'Créer une tontine',
              onTap: () => context.push('/app/groups/create'),
            ),
            _OnboardingAction(
              icon: Icons.vpn_key_outlined,
              label: l10n.joinGroup,
              onTap: () => context.push('/app/groups/join'),
            ),
            _OnboardingAction(
              icon: Icons.explore_outlined,
              label: 'Découvrir des tontines',
              onTap: () => context.push('/app/groups/discover'),
            ),
            _OnboardingAction(
              icon: Icons.groups_rounded,
              label: 'Mes tontines (multi-adhésion)',
              onTap: () => context.push('/app/groups/mine'),
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

/// Carte groupe (maquette « Mes groupes ») : couverture, nom, membres + rôle,
/// progression du cycle, prochaine cotisation.
class _GroupListCard extends StatelessWidget {
  const _GroupListCard({required this.group});
  final GroupSummary group;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    final String locale = Localizations.localeOf(context).toLanguageTag();
    final double progress = group.cycleTotal == 0 ? 0 : (group.cycleIndex / group.cycleTotal).clamp(0, 1);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: () => context.push('/app/groups/${group.id}'),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: KombeColors.line),
          ),
          child: Column(
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  CoverImage(groupId: group.id, url: group.coverUrl, width: 96, height: 112),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Row(
                          children: <Widget>[
                            Expanded(child: Text(group.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: t.titleMedium?.copyWith(fontSize: 17))),
                            const Icon(Icons.chevron_right_rounded, color: KombeColors.ink),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 10,
                          runSpacing: 6,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: <Widget>[
                            Row(mainAxisSize: MainAxisSize.min, children: <Widget>[
                              const Icon(Icons.groups_rounded, size: 18, color: KombeColors.forest),
                              const SizedBox(width: 5),
                              Text('${group.memberCount} membres', style: t.bodySmall?.copyWith(color: KombeColors.ink)),
                            ]),
                            RoleChip(role: group.role),
                          ],
                        ),
                        const SizedBox(height: 12),
                        Text('Cycle ${group.cycleIndex}/${group.cycleTotal}', style: t.bodyMedium?.copyWith(color: KombeColors.ink)),
                        const SizedBox(height: 6),
                        Row(
                          children: <Widget>[
                            Expanded(
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(99),
                                child: LinearProgressIndicator(value: progress, minHeight: 7),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Text('${(progress * 100).round()}%', style: t.labelMedium?.copyWith(color: KombeColors.emerald, letterSpacing: 0)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const Divider(height: 22),
              Row(
                children: <Widget>[
                  Container(
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(color: KombeColors.sand, borderRadius: BorderRadius.circular(9)),
                    child: const Icon(Icons.calendar_month_rounded, size: 19, color: KombeColors.goldDark),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text('Prochaine cotisation', style: t.bodySmall),
                        Text(DateFormat.yMMMd(locale).format(group.nextDueAtUtc.toLocal()), style: t.titleSmall),
                      ],
                    ),
                  ),
                  const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
