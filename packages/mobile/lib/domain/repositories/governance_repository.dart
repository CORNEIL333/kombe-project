import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/governance.dart';

abstract interface class GovernanceRepository {
  Future<Resource<List<ValidationItem>>> listPendingValidations();
  Future<Resource<ValidationItem>> getValidation(String contributionId);

  Future<OperationResult<void>> decideValidation({
    required String contributionId,
    required int expectedVersion,
    required ValidationDecision decision,
  });

  Future<Resource<List<VoteSummary>>> listVotes();
  Future<Resource<VoteDetails>> getVote(String voteId);

  Future<OperationResult<void>> castVote({
    required String voteId,
    required VoteChoice choice,
  });
}
