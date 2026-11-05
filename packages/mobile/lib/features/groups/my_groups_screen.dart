import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../app/active_group_controller.dart';
import '../../app/router/main_shell.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/design/kombe_ndop.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/kombe_screen_header.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Onglet « Groupes » (planche de référence) : toutes mes tontines, leur photo
/// ou couverture, ma fonction, la progression RÉELLE du cycle, la prochaine
/// cotisation ; créer et rejoindre en tuiles. Le sélecteur de la barre du
/// haut sert au changement rapide ; cet onglet est la vue complète.
class MyGroupsScreen extends StatefulWidget {
  const MyGroupsScreen({super.key});

  @override
  State<MyGroupsScreen> createState() => _MyGroupsScreenState();
}

class _MyGroupsScreenState extends State<MyGroupsScreen> {
  Resource<List<MemberGroup>> _memberships = const ResourceLoading<List<MemberGroup>>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<MemberGroup>> next = await context.read<GroupRepository>().listMyGroups();
    if (mounted) setState(() => _memberships = next);
  }

  ActiveGroupController? get _active {
    try {
      return context.watch<ActiveGroupController>();
    } on ProviderNotFoundException {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final ActiveGroupController? active = _active;
    final List<GroupSummary> groups = active?.list ?? const <GroupSummary>[];
    final List<MemberGroup> pending = switch (_memberships) {
      ResourceReady<List<MemberGroup>>(:final List<MemberGroup> data) => data.where((MemberGroup m) => m.membershipState == 'pending').toList(),
      _ => const <MemberGroup>[],
    };
    final bool loading = (active == null || active.groups is ResourceLoading<List<GroupSummary>>) && _memberships is ResourceLoading<List<MemberGroup>>;
    return Scaffold(
      backgroundColor: KombeColors.cream,
      appBar: KombeShellScope.of(context) == null ? AppBar(title: const Text('Mes tontines')) : const KombeTopBar(),
      body: RefreshIndicator(
        onRefresh: () async {
          await active?.refresh();
          await _load();
        },
        child: ListView(
          padding: const EdgeInsets.only(bottom: 28),
          children: <Widget>[
            const KombeScreenHeader(title: 'Mes groupes'),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 6, 16, 14),
              child: Row(
                children: <Widget>[
                  Expanded(
                    child: _Tile(icon: Icons.add_circle_outline_rounded, label: 'Créer une tontine', strong: true, onTap: () => context.push('/app/groups/create')),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _Tile(icon: Icons.person_add_alt_1_outlined, label: 'Rejoindre un groupe', onTap: () => context.push('/app/groups/join')),
                  ),
                ],
              ),
            ),
            if (loading) const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
            if (!loading && groups.isEmpty && pending.isEmpty)
              const EmptyState(title: 'Aucune tontine', body: 'Rejoignez une tontine avec le code reçu du bureau, ou créez la vôtre.'),
            for (final GroupSummary g in groups)
              _GroupCard(
                group: g,
                active: g.id == active?.active?.id,
                onOpen: () {
                  unawaited(active?.select(g.id));
                  context.push('/app/groups/${Uri.encodeComponent(g.id)}');
                },
              ),
            for (final MemberGroup m in pending)
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: ListTile(
                  tileColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
                  leading: GroupAvatar(groupId: m.groupId, name: m.displayName, size: 48),
                  title: Text(m.displayName, style: const TextStyle(fontWeight: FontWeight.w800)),
                  subtitle: const Text('Adhésion en attente de l’accord du bureau'),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.label, required this.onTap, this.strong = false});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool strong;

  @override
  Widget build(BuildContext context) {
    final Color fg = strong ? KombeColors.cream : KombeColors.forest;
    return Material(
      color: strong ? KombeColors.forest : KombeColors.mint,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 88),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Icon(icon, color: fg, size: 26),
                const SizedBox(height: 6),
                Text(label, textAlign: TextAlign.center, style: TextStyle(color: fg, fontWeight: FontWeight.w700, fontSize: 14)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Coupon de tissu : chaque tontine a sa couleur et son motif ; sa photo, son
/// nom, les perles du cycle et l'échéance.
class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.group, required this.active, required this.onOpen});
  final GroupSummary group;
  final bool active;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final GroupSummary g = group;
    final GroupHue hue = groupHue(g.id);
    final bool inCycle = g.cycleTotal > 0 && g.cycleIndex > 0;
    final String date = DateFormat('d MMM y', Localizations.localeOf(context).toLanguageTag()).format(g.nextDueAtUtc.toLocal());
    const TextStyle soft = TextStyle(color: Color(0xE6FFFFFF), fontSize: 14, fontWeight: FontWeight.w600);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NdopSurface(
            color: hue.bg,
            variant: hue.variant,
            opacity: .18,
            tile: 30,
            fadeTo: Alignment.centerLeft,
            borderRadius: BorderRadius.circular(24),
            child: Material(
              type: MaterialType.transparency,
              child: InkWell(
                onTap: onOpen,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 12, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      Row(
                        children: <Widget>[
                          GroupAvatar(groupId: g.id, name: g.name, photoVersion: g.photoVersion, size: 60),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                Text(g.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: KombeType.display(size: 24, color: Colors.white)),
                                const SizedBox(height: 4),
                                Text('${g.memberCount} membres', style: soft),
                              ],
                            ),
                          ),
                          if (active) const Icon(Icons.check_circle_rounded, color: KombeColors.goldWarm, semanticLabel: 'Groupe actif'),
                        ],
                      ),
                      if (inCycle) ...<Widget>[
                        const SizedBox(height: 14),
                        KombeCycleBand(index: g.cycleIndex, total: g.cycleTotal, onDark: true, height: 20),
                        const SizedBox(height: 6),
                        Text('Cycle ${g.cycleIndex}/${g.cycleTotal}', style: soft),
                      ],
                      const SizedBox(height: 12),
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: <Widget>[
                                const Text('Prochaine cotisation', style: soft),
                                Text(date, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w800)),
                              ],
                            ),
                          ),
                          StatusPill(g.role == GroupRole.member ? 'Membre' : roleLabel(g.role), tone: KombeTone.money, icon: g.role == GroupRole.member ? null : Icons.star_rounded),
                          if (g.role != GroupRole.member)
                            IconButton(
                              tooltip: 'Outils du bureau',
                              onPressed: () => context.push('/app/groups/${Uri.encodeComponent(g.id)}/bureau'),
                              icon: const Icon(Icons.work_outline_rounded, color: Colors.white),
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
