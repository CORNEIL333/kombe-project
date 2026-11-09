import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/share_name.dart';

/// Les « noms » du cycle (0041) : une part = un nom, renommable par son
/// titulaire ou le bureau.
abstract interface class ShareNameRepository {
  Future<Resource<List<ShareName>>> listNames(String groupId);
  Future<OperationResult<ShareName>> rename({required String groupId, required String shareId, required String label});
}
