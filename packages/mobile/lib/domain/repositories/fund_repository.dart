import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/fund.dart';

/// Caisses et cotisations d'un groupe (`/v1/tontines/:id/funds`).
abstract interface class FundRepository {
  Future<Resource<GroupFunds>> listFunds(String groupId);

  /// Nouvelle caisse propre à la tontine, effective dès aujourd'hui : jamais
  /// rétroactive. Bureau seulement (le serveur le vérifie).
  Future<OperationResult<void>> createFund(String groupId, FundCreation creation);

  /// Clôture : ce qui était dû jusqu'à aujourd'hui reste dû.
  Future<OperationResult<void>> closeFund(String groupId, String fundId);
}

final class UnavailableFundRepository implements FundRepository {
  const UnavailableFundRepository();

  static const String _reason = 'Service KÓMBE non configuré sur cet appareil.';

  @override
  Future<Resource<GroupFunds>> listFunds(String groupId) async => const ResourceUnavailable<GroupFunds>();

  @override
  Future<OperationResult<void>> createFund(String groupId, FundCreation creation) async => const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<void>> closeFund(String groupId, String fundId) async => const OperationBlocked<void>(_reason);
}
