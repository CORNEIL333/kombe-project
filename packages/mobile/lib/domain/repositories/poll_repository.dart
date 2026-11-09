import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/poll.dart';

/// Votes libres d'un groupe (0041).
abstract interface class PollRepository {
  Future<Resource<List<Poll>>> listPolls(String groupId);
  Future<OperationResult<Poll>> openPoll(String groupId, PollDraft draft);
  Future<OperationResult<Poll>> answer({required String groupId, required String pollId, required List<int> choices, String? freeAnswer});
  Future<OperationResult<Poll>> end({required String groupId, required String pollId, required bool cancel});
}
