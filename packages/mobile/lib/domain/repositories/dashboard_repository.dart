import '../../core/state/resource.dart';
import '../entities/dashboard.dart';
import '../entities/group.dart';

abstract interface class DashboardRepository {
  /// Accueil du groupe actif : lectures en parallèle, aucune valeur inventée.
  Future<Resource<HomeData>> loadHome(GroupSummary group);
}
