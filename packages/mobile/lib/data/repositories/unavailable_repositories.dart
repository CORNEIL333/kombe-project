import 'dart:typed_data';

import '../../core/api/api_failure.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../domain/entities/auth.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/document.dart';
import '../../domain/entities/fine.dart';
import '../../domain/entities/meeting.dart';
import '../../domain/entities/governance.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../../domain/entities/profile.dart';
import '../../domain/entities/poll.dart';
import '../../domain/repositories/poll_repository.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../../domain/repositories/document_repository.dart';
import '../../domain/repositories/fine_repository.dart';
import '../../domain/repositories/meeting_repository.dart';
import '../../domain/repositories/governance_repository.dart';
import '../../domain/repositories/group_repository.dart';
import '../../domain/repositories/notification_repository.dart';
import '../../domain/repositories/profile_repository.dart';

/// Motif affiché quand l'application a été construite sans adresse de
/// serveur (`--dart-define=KOMBE_API_BASE_URL` absent) : rien n'est simulé.
const String _reason =
    'Cette version de l’application n’est reliée à aucun serveur KÓMBE. Installez la version officielle pour vous connecter.';

final class UnavailableAuthRepository implements AuthRepository {
  const UnavailableAuthRepository();

  @override
  Stream<Resource<AuthSession?>> watchSession() =>
      Stream<Resource<AuthSession?>>.value(const ResourceUnavailable<AuthSession?>());

  @override
  Future<Resource<AuthChannels>> loadChannels() async => const ResourceUnavailable<AuthChannels>();

  @override
  Future<OperationResult<void>> requestCode({required String login, required LoginChannel channel}) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<AuthSession>> verifyCode({required String login, required String code}) async =>
      const OperationBlocked<AuthSession>(_reason);

  @override
  Future<OperationResult<void>> signOut() async => const OperationSuccess<void>(null);
}

final class UnavailableProfileRepository implements ProfileRepository {
  const UnavailableProfileRepository();

  @override
  Future<Uint8List?> loadPhoto(int version, int size) async => null;

  @override
  Future<OperationResult<int>> setPhoto(Uint8List jpeg512, Uint8List jpeg256) async => const OperationBlocked<int>(_reason);

  @override
  Future<OperationResult<void>> removePhoto() async => const OperationBlocked<void>(_reason);

  @override
  Future<Resource<UserProfile>> loadProfile() async => const ResourceUnavailable<UserProfile>();

  @override
  Future<OperationResult<UserProfile>> updateProfile({required String displayName, required String localeCode}) async =>
      const OperationBlocked<UserProfile>(_reason);
}

final class UnavailableGroupRepository implements GroupRepository {
  const UnavailableGroupRepository();

  @override
  Future<Resource<List<GroupSummary>>> listGroups() async => const ResourceUnavailable<List<GroupSummary>>();

  @override
  Future<Resource<GroupDetails>> getGroup(String groupId) async => const ResourceUnavailable<GroupDetails>();

  @override
  Future<Resource<List<GroupMember>>> listMembers(String groupId) async => const ResourceUnavailable<List<GroupMember>>();

  @override
  Future<Resource<GroupMember>> getMember(String groupId, String identityId) async => const ResourceUnavailable<GroupMember>();

  @override
  Future<Resource<CycleDetails>> getCycle(String groupId) async => const ResourceUnavailable<CycleDetails>();

  @override
  Future<Resource<List<String>>> getRules(String groupId) async => const ResourceUnavailable<List<String>>();

  @override
  Future<OperationResult<void>> joinGroup(String invitationCode) async => const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<GroupInvitation>> createInvitation(String groupId) async =>
      const OperationBlocked<GroupInvitation>(_reason);

  @override
  Future<OperationResult<String>> createGroup(TontineCreation draft) async => const OperationBlocked<String>(_reason);

  @override
  Future<OperationResult<void>> startCycle(String groupId, CycleOrderKind order) async => const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<void>> renewCycle(String groupId, CycleOrderKind order) async => const OperationBlocked<void>(_reason);

  @override
  Future<Resource<List<MemberGroup>>> listMyGroups() async => const ResourceUnavailable<List<MemberGroup>>();

  @override
  Future<OperationResult<void>> decideAdmission({required String groupId, required String membershipId, required bool admit}) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<void>> proposeRole({required String groupId, required String membershipId, required String role}) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<void>> acceptRole({required String groupId, required String role}) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<Resource<TontineStatutes?>> getStatutes(String groupId) async => const ResourceUnavailable<TontineStatutes?>();

  @override
  Future<OperationResult<TontineStatutes>> acceptStatutes({required String groupId, required String hash}) async =>
      const OperationBlocked<TontineStatutes>(_reason);

  @override
  Future<OperationResult<TontineStatutes>> publishStatutes({
    required String groupId,
    required int acceptanceDays,
    required StatutesOnExpiry onExpiry,
  }) async =>
      const OperationBlocked<TontineStatutes>(_reason);

  @override
  Future<Uint8List?> loadPhoto(String groupId, int version, int size) async => null;

  @override
  Future<Uint8List?> loadMemberPhoto(String groupId, String memberId, int version, int size) async => null;

  @override
  Future<OperationResult<int>> setPhoto(String groupId, Uint8List jpeg512, Uint8List jpeg256) async =>
      const OperationBlocked<int>(_reason);

  @override
  Future<OperationResult<void>> removePhoto(String groupId) async => const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<TontineStatutes>> extendStatutesDeadline({
    required String groupId,
    required int extendDays,
    StatutesOnExpiry? onExpiry,
  }) async =>
      const OperationBlocked<TontineStatutes>(_reason);

  @override
  Future<OperationResult<int>> remindStatutes(String groupId) async => const OperationBlocked<int>(_reason);
}

final class UnavailableContributionRepository implements ContributionRepository {
  const UnavailableContributionRepository();

  @override
  Future<Resource<List<Contribution>>> listHistory({String? groupId}) async => const ResourceUnavailable<List<Contribution>>();

  @override
  Future<Resource<Contribution>> getContribution(String contributionId) async => const ResourceUnavailable<Contribution>();

  @override
  Future<Resource<List<OpenDue>>> openDues(String groupId) async =>
      const ResourceUnavailable<List<OpenDue>>();

  @override
  Future<DeclarationReceipt> sendDeclaration(ContributionDraft draft) async =>
      DeclarationReceipt(lines: draft.plan, error: const ApiFailure(statusCode: 0, code: 'UNCONFIGURED', message: _reason));
}

final class UnavailableGovernanceRepository implements GovernanceRepository {
  const UnavailableGovernanceRepository();

  @override
  Future<Resource<List<ValidationItem>>> listPendingValidations() async => const ResourceUnavailable<List<ValidationItem>>();

  @override
  Future<Resource<ValidationItem>> getValidation(String contributionId) async => const ResourceUnavailable<ValidationItem>();

  @override
  Future<OperationResult<void>> decideValidation({
    required String contributionId,
    required int expectedVersion,
    required ValidationDecision decision,
    String? reason,
  }) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<Resource<List<VoteSummary>>> listVotes() async => const ResourceUnavailable<List<VoteSummary>>();

  @override
  Future<Resource<VoteDetails>> getVote(String voteId) async => const ResourceUnavailable<VoteDetails>();

  @override
  Future<OperationResult<void>> castVote({required String voteId, required VoteChoice choice}) async =>
      const OperationBlocked<void>(_reason);
}

final class UnavailableFineRepository implements FineRepository {
  const UnavailableFineRepository();

  @override
  Future<Resource<List<MyFine>>> listMyFines() async => const ResourceUnavailable<List<MyFine>>();

  @override
  Future<OperationResult<MyFine>> contestFine({required MyFine fine, required String reason}) async =>
      const OperationBlocked<MyFine>(_reason);

  @override
  Future<Resource<List<MyFine>>> listGroupFines({required String groupId, required String groupName}) async => const ResourceUnavailable<List<MyFine>>();

  @override
  Future<OperationResult<MyFine>> cancelFine({required MyFine fine, required String reason}) async => const OperationBlocked<MyFine>(_reason);

  @override
  Future<OperationResult<MyFine>> refundFine({required MyFine fine, required String channel, String? reference}) async => const OperationBlocked<MyFine>(_reason);
}

final class UnavailablePollRepository implements PollRepository {
  const UnavailablePollRepository();

  @override
  Future<Resource<List<Poll>>> listPolls(String groupId) async => const ResourceUnavailable<List<Poll>>();

  @override
  Future<OperationResult<Poll>> openPoll(String groupId, PollDraft draft) async => const OperationBlocked<Poll>(_reason);

  @override
  Future<OperationResult<Poll>> answer({required String groupId, required String pollId, required List<int> choices, String? freeAnswer}) async =>
      const OperationBlocked<Poll>(_reason);

  @override
  Future<OperationResult<Poll>> end({required String groupId, required String pollId, required bool cancel}) async => const OperationBlocked<Poll>(_reason);
}

final class UnavailableMeetingRepository implements MeetingRepository {
  const UnavailableMeetingRepository();

  @override
  Future<Resource<List<MeetingSummary>>> listMeetings(String groupId) async => const ResourceUnavailable<List<MeetingSummary>>();

  @override
  Future<Resource<MeetingDetail>> getMeeting({required String groupId, required String meetingId}) async => const ResourceUnavailable<MeetingDetail>();
}

final class UnavailableNotificationRepository implements NotificationRepository {
  const UnavailableNotificationRepository();

  @override
  Future<Resource<List<KombeNotification>>> listNotifications() async => const ResourceUnavailable<List<KombeNotification>>();

  @override
  Future<OperationResult<void>> markRead(String notificationId) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<int> unreadCount() async => 0;

  @override
  Future<OperationResult<void>> markAllRead() async => const OperationBlocked<void>(_reason);
}

final class UnavailableDocumentRepository implements DocumentRepository {
  const UnavailableDocumentRepository();

  @override
  Future<Resource<List<KombeDocument>>> listDocuments() async => const ResourceUnavailable<List<KombeDocument>>();
}

final class UnavailableDashboardRepository implements DashboardRepository {
  const UnavailableDashboardRepository();

  @override
  Future<Resource<HomeData>> loadHome(GroupSummary group) async =>
      const ResourceUnavailable<HomeData>();
}
