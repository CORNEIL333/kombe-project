import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../app/active_group_controller.dart';
import '../../app/router/main_shell.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/kombe_sheet.dart';
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
            KombeScreenHeader(
              title: 'Mes groupes',
              trailing: IconButton.filledTonal(
                tooltip: 'Créer ou rejoindre',
                onPressed: () => _addGroup(context),
                icon: const Icon(Icons.add_rounded),
              ),
            ),
            if (loading) const Padding(padding: EdgeInsets.all(32), child: Center(child: CircularProgressIndicator())),
            if (!loading && groups.isEmpty && pending.isEmpty)
              const EmptyState(title: 'Aucune tontine', body: 'Rejoignez une tontine avec le code reçu du bureau, ou créez la vôtre.'),
            for (final GroupSummary g in _byUrgency(groups))
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
                child: KombeCard(
                  color: KombeColors.sand,
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    children: <Widget>[
                      GroupAvatar(groupId: m.groupId, name: m.displayName, size: 52),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: <Widget>[
                            Text(m.displayName, maxLines: 1, overflow: TextOverflow.ellipsis, style: KombeType.display(size: 20, color: KombeColors.ink)),
                            const Text('En attente', style: TextStyle(color: KombeColors.slate, fontSize: 14, fontWeight: FontWeight.w600)),
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
    );
  }
}

/// Le plus urgent d'abord : ce qui est à payer, par date ; puis le reste.
List<GroupSummary> _byUrgency(List<GroupSummary> all) {
  final List<GroupSummary> out = <GroupSummary>[...all];
  out.sort((GroupSummary a, GroupSummary b) {
    if ((a.openDueXaf > 0) != (b.openDueXaf > 0)) return a.openDueXaf > 0 ? -1 : 1;
    return a.nextDueAtUtc.compareTo(b.nextDueAtUtc);
  });
  return out;
}

Future<void> _addGroup(BuildContext context) => showKombeSheet<void>(
      context,
      title: 'Ajouter un groupe',
      builder: (BuildContext sheet) => KombeGroupedList(
        children: <Widget>[
          KombeMenuRow(
            icon: Icons.group_add_outlined,
            title: 'Rejoindre avec un code',
            onTap: () {
              Navigator.of(sheet).pop();
              context.push('/app/groups/join');
            },
          ),
          KombeMenuRow(
            icon: Icons.add_rounded,
            title: 'Créer une tontine',
            onTap: () {
              Navigator.of(sheet).pop();
              context.push('/app/groups/create');
            },
          ),
        ],
      ),
    );

/// Carte de groupe, une seule structure : avatar, nom, fonction ; « À payer »
/// en plus gros texte quand il y a quelque chose à payer ; points du cycle.
/// Toute la carte s'ouvre, un seul chevron. Le liseré porte l'identité.
class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.group, required this.active, required this.onOpen});
  final GroupSummary group;
  final bool active;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final GroupSummary g = group;
    final bool inCycle = g.cycleTotal > 0 && g.cycleIndex > 0;
    final bool due = g.openDueXaf > 0;
    final bool late = due && g.nextDueAtUtc.isBefore(DateTime.now());
    final String date = DateFormat('d MMM', Localizations.localeOf(context).toLanguageTag()).format(g.nextDueAtUtc.toLocal());
    final Color edge = HSLColor.fromColor(KombeColors.tintOf(g.id)).withLightness(.62).toColor();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onOpen,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 168),
            child: IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: <Widget>[
                  ColoredBox(color: edge, child: const SizedBox(width: 5)),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(14, 14, 8, 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: <Widget>[
                          Row(
                            children: <Widget>[
                              GroupAvatar(groupId: g.id, name: g.name, photoVersion: g.photoVersion, size: 48),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: <Widget>[
                                    Text(g.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: KombeType.display(size: 20, color: KombeColors.ink)),
                                    Text(g.role == GroupRole.member ? 'Membre' : roleLabel(g.role), style: const TextStyle(color: KombeColors.slate, fontSize: 14, fontWeight: FontWeight.w600)),
                                  ],
                                ),
                              ),
                              const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
                            ],
                          ),
                          if (due) ...<Widget>[
                            const SizedBox(height: 12),
                            const Text('À payer', style: TextStyle(color: KombeColors.ink, fontSize: 14, fontWeight: FontWeight.w700)),
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.center,
                              children: <Widget>[
                                Expanded(child: FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: KombeAmount(g.openDueXaf, size: 30, color: KombeColors.ink))),
                                const SizedBox(width: 8),
                                if (late)
                                  const StatusPill('En retard', tone: KombeTone.danger)
                                else
                                  Text('avant le $date', style: const TextStyle(color: KombeColors.ink, fontSize: 14, fontWeight: FontWeight.w600)),
                              ],
                            ),
                          ],
                          const Spacer(),
                          if (inCycle) ...<Widget>[
                            const SizedBox(height: 10),
                            Row(
                              children: <Widget>[
                                Expanded(child: KombeCycleBand(index: g.cycleIndex, total: g.cycleTotal)),
                                Text('Cycle ${g.cycleIndex}/${g.cycleTotal}', style: const TextStyle(color: KombeColors.slate, fontSize: 14)),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
