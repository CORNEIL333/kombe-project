import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/active_group_controller.dart';
import '../../app/router/main_shell.dart';
import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../../domain/repositories/draft_repository.dart';
import 'dashboard_content.dart';
import 'dashboard_view_model.dart';

/// Accueil : le groupe actif (titre, changeable), ce qui m'attend, ma
/// situation, ce qui vient de se passer.
class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late final DashboardViewModel _vm =
      DashboardViewModel(context.read<DashboardRepository>(), context.read<ContributionDraftRepository>());
  String? _loadedFor;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final GroupSummary? g = context.watch<ActiveGroupController>().active;
    if (g != null && g.id != _loadedFor) {
      _loadedFor = g.id;
      _vm.load(g);
    }
  }

  @override
  void dispose() {
    _vm.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    final ActiveGroupController groups = context.read<ActiveGroupController>();
    await groups.refresh();
    final GroupSummary? g = groups.active;
    if (g != null) await _vm.load(g);
  }

  @override
  Widget build(BuildContext context) {
    final ActiveGroupController groups = context.watch<ActiveGroupController>();
    final int unread = KombeShellScope.of(context)?.unread ?? 0;
    return Scaffold(
      appBar: KombeTopBar(
        title: const ActiveGroupTitle(),
        actions: <Widget>[
          IconButton(
            tooltip: unread > 0 ? 'Activité, $unread non lues' : 'Activité',
            onPressed: () => context.go('/app/notifications'),
            icon: Badge(
              isLabelVisible: unread > 0,
              label: Text(unread > 99 ? '99+' : '$unread'),
              child: const Icon(Icons.notifications_none_rounded),
            ),
          ),
        ],
      ),
      body: switch (groups.groups) {
        ResourceLoading<List<GroupSummary>>() => const Center(child: CircularProgressIndicator()),
        ResourceReady<List<GroupSummary>>(:final List<GroupSummary> data) when data.isEmpty => const NoGroupHome(),
        ResourceReady<List<GroupSummary>>() => ListenableBuilder(
            listenable: _vm,
            builder: (BuildContext context, _) => RefreshIndicator(
              onRefresh: _refresh,
              child: ResourceView<HomeData>(
                resource: _vm.state,
                builder: (BuildContext context, HomeData data) => HomeContent(data: data, drafts: _vm.drafts),
              ),
            ),
          ),
        final Resource<List<GroupSummary>> other => ResourceView<List<GroupSummary>>(
            resource: other,
            builder: (_, __) => const SizedBox.shrink(),
          ),
      },
    );
  }
}
