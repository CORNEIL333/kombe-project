import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/active_group_controller.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';

/// Toutes mes adhésions (`GET /me/tontines`), actives ou en attente.
/// Toucher un groupe actif en fait le groupe de l'accueil.
class MyGroupsScreen extends StatefulWidget {
  const MyGroupsScreen({super.key});

  @override
  State<MyGroupsScreen> createState() => _MyGroupsScreenState();
}

class _MyGroupsScreenState extends State<MyGroupsScreen> {
  Resource<List<MemberGroup>> _state = const ResourceLoading<List<MemberGroup>>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<List<MemberGroup>> next = await context.read<GroupRepository>().listMyGroups();
    if (mounted) setState(() => _state = next);
  }

  ActiveGroupController? get _active {
    try {
      return context.read<ActiveGroupController>();
    } on ProviderNotFoundException {
      return null;
    }
  }

  void _open(MemberGroup g) {
    if (g.membershipState != 'active') {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Votre adhésion attend l’accord du bureau. Le groupe s’ouvrira dès qu’elle sera acceptée.'),
      ));
      return;
    }
    final ActiveGroupController? active = _active;
    if (active != null) unawaited(active.select(g.groupId));
    context.go('/app');
  }

  @override
  Widget build(BuildContext context) {
    final String? activeId = _active?.active?.id;
    return Scaffold(
      appBar: AppBar(title: const Text('Mes tontines')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ResourceView<List<MemberGroup>>(
          resource: _state,
          onRetry: _load,
          emptyWhen: (List<MemberGroup> g) => g.isEmpty,
          emptyTitle: 'Aucune tontine',
          emptyBody: 'Rejoignez une tontine avec le code reçu du bureau, ou créez la vôtre.',
          builder: (BuildContext context, List<MemberGroup> groups) => ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: <Widget>[
              for (final MemberGroup g in groups)
                ListTile(
                  minVerticalPadding: 12,
                  leading: KombeAvatar(name: g.displayName, size: 44),
                  title: Text(g.displayName),
                  subtitle: Text(membershipStateLabel(g.membershipState)),
                  trailing: g.groupId == activeId
                      ? const Icon(Icons.check_rounded, color: KombeColors.forest, semanticLabel: 'groupe actif')
                      : const Icon(Icons.chevron_right_rounded),
                  onTap: () => _open(g),
                ),
              const Divider(height: 32),
              ListTile(
                leading: const Icon(Icons.group_add_outlined, color: KombeColors.forest),
                title: const Text('Rejoindre avec un code'),
                onTap: () => context.push('/app/groups/join'),
              ),
              ListTile(
                leading: const Icon(Icons.add_circle_outline_rounded, color: KombeColors.forest),
                title: const Text('Créer une tontine'),
                onTap: () => context.push('/app/groups/create'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
