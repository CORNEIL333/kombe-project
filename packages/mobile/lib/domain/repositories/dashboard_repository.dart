import '../../core/state/resource.dart';
import '../entities/dashboard.dart';

abstract interface class DashboardRepository {
  Future<Resource<DashboardData>> loadDashboard();
}
