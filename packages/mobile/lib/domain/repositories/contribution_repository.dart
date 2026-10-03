import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/contribution.dart';

abstract interface class ContributionRepository {
  Future<Resource<List<Contribution>>> listHistory({String? groupId});
  Future<Resource<Contribution>> getContribution(String contributionId);
  Future<OperationResult<Contribution>> submitDraft(ContributionDraft draft);
}
