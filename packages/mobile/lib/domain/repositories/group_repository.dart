import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/cycle.dart';
import '../entities/group.dart';

abstract interface class GroupRepository {
  Future<Resource<List<GroupSummary>>> listGroups();
  Future<Resource<GroupDetails>> getGroup(String groupId);
  Future<Resource<List<GroupMember>>> listMembers(String groupId);
  Future<Resource<GroupMember>> getMember(String groupId, String identityId);
  Future<Resource<CycleDetails>> getCycle(String groupId);
  Future<Resource<List<String>>> getRules(String groupId);
  Future<OperationResult<void>> joinGroup(String invitationCode);
  Future<OperationResult<void>> inviteMember({
    required String groupId,
    required String phoneE164,
  });
}
