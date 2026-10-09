import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/widgets/screen_states.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/repositories/dashboard_repository.dart';
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
    }
  }

  bool _initialized = false;

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
              DashboardContent(data: data, onRefresh: _viewModel.load),
        );
      },
    );
  }
}
