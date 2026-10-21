import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/fine.dart';

abstract interface class FineRepository {
  /// Mes amendes, tous groupes confondus (les plus récentes d'abord).
  Future<Resource<List<MyFine>>> listMyFines();

  /// Conteste une amende (`POST /v1/tontines/:id/fines/:fid/contest`,
  /// motif de 3 à 500 caractères) ; la présidence tranche ensuite.
  Future<OperationResult<MyFine>> contestFine({required MyFine fine, required String reason});
}
