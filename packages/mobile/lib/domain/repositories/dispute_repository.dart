import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/dispute.dart';

abstract interface class DisputeRepository {
  Future<Resource<List<DisputeSummary>>> listDisputes();
  Future<Resource<DisputeDetails>> getDispute(String disputeId);
  Future<OperationResult<DisputeSummary>> openDispute({
    required String groupId,
    required String subject,
    required String description,
    String? relatedOperationId,
  });
}
