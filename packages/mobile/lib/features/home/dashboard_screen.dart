import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/state/resource.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/profile.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../../domain/repositories/profile_repository.dart';
import 'dashboard_content.dart';
import 'dashboard_view_model.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late final DashboardViewModel _viewModel;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!(_initialized)) {
      _initialized = true;
      _viewModel = DashboardViewModel(context.read<DashboardRepository>())..load();
      // Le prénom de la salutation vient du profil réel ; son absence n'empêche rien.
      _profile = context.read<ProfileRepository>().loadProfile();
    }
  }

  bool _initialized = false;
  Future<Resource<UserProfile>>? _profile;

  @override
  void dispose() {
    if (_initialized) _viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!_initialized) return const SizedBox.shrink();
    return ListenableBuilder(
      listenable: _viewModel,
      builder: (BuildContext context, Widget? child) {
        return ResourceView<DashboardData>(
          resource: _viewModel.state,
          builder: (BuildContext context, DashboardData data) =>
              FutureBuilder<Resource<UserProfile>>(
            future: _profile,
            builder: (BuildContext context, AsyncSnapshot<Resource<UserProfile>> snap) {
              final UserProfile? me = switch (snap.data) {
                ResourceReady<UserProfile>(:final UserProfile data) => data,
                _ => null,
              };
              return DashboardContent(data: data, onRefresh: _viewModel.load, displayName: me?.displayName, avatarUrl: me?.avatarUrl);
            },
          ),
        );
      },
    );
  }
}
