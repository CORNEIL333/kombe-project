import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Vue consolidée « mes tontines » (C21 §2.5) : TOUTES les tontines dont le
/// membre fait partie (MULTI-ADHÉSION), servie par la route RÉELLE
/// `GET /me/groups`. Contrairement à la maquette [GroupSummary] (champs
/// financiers non exposés au pilote), cette vue n'affiche que l'identité de la
/// tontine, son modèle/typologie, l'état d'adhésion, et la hiérarchie de
/// supervision (une grande tontine qui en chapeaute plusieurs). L'identité
/// listée est toujours celle de la session, résolue serveur (§14).
class MyGroupsScreen extends StatefulWidget {
  const MyGroupsScreen({super.key});

  @override
  State<MyGroupsScreen> createState() => _MyGroupsScreenState();
}

class _MyGroupsScreenState extends State<MyGroupsScreen> {
  Resource<List<MemberGroup>> _state =
      const ResourceLoading<List<MemberGroup>>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _state = const ResourceLoading<List<MemberGroup>>());
    final Resource<List<MemberGroup>> next =
        await context.read<GroupRepository>().listMyGroups();
    if (!mounted) return;
    setState(() => _state = next);
  }

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Mes tontines')),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ResourceView<List<MemberGroup>>(
            resource: _state,
            emptyWhen: (List<MemberGroup> g) => g.isEmpty,
            emptyTitle: 'Aucune tontine',
            emptyBody:
                "Vous n'êtes membre d'aucune tontine pour le moment. Créez-en "
                'une, rejoignez-en une par code, ou demandez un parrainage.',
            builder: (BuildContext context, List<MemberGroup> groups) =>
                ListView.separated(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 100),
              itemCount: groups.length,
              separatorBuilder: (_, __) => const SizedBox(height: 12),
              itemBuilder: (BuildContext context, int i) {
                final MemberGroup g = groups[i];
                return Card(
                  child: ListTile(
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    title: Text(g.displayName,
                        style:
                            t.titleMedium?.copyWith(fontWeight: FontWeight.w600)),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Wrap(
                            spacing: 8,
                            runSpacing: 6,
                            children: <Widget>[
                              _Chip(label: tontineModelLabel(g.tontineModel)),
                              _Chip(label: rotationTypeLabel(g.rotationType)),
                              _Chip(label: membershipStateLabel(g.membershipState)),
                            ],
                          ),
                          if (g.parentGroupId != null &&
                              g.parentGroupId!.isNotEmpty) ...<Widget>[
                            const SizedBox(height: 6),
                            Row(
                              children: <Widget>[
                                const Icon(Icons.account_tree_outlined,
                                    size: 15),
                                const SizedBox(width: 6),
                                Expanded(
                                  child: Text(
                                    'Supervisée par ${g.parentGroupId}',
                                    style: t.bodySmall,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ],
                      ),
                    ),
                    trailing: const Icon(
                        Icons.chevron_right_rounded),
                    onTap: () => context.push('/app/groups/${g.groupId}'),
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Chip(
        label: Text(label, style: Theme.of(context).textTheme.bodySmall),
        visualDensity: VisualDensity.compact,
        padding: EdgeInsets.zero,
      );
}
