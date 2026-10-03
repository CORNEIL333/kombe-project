import 'package:flutter/foundation.dart';

import '../../core/state/resource.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/repositories/dashboard_repository.dart';

final class DashboardViewModel extends ChangeNotifier {
  DashboardViewModel(this._repository);

  final DashboardRepository _repository;
  Resource<DashboardData> state = const ResourceLoading<DashboardData>();

  Future<void> load() async {
    state = const ResourceLoading<DashboardData>();
    notifyListeners();
    state = await _repository.loadDashboard();
    notifyListeners();
  }
}
