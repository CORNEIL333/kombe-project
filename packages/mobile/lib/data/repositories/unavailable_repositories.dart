import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../domain/entities/auth.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/dispute.dart';
import '../../domain/entities/document.dart';
import '../../domain/entities/governance.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../../domain/entities/profile.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../../domain/repositories/dispute_repository.dart';
import '../../domain/repositories/document_repository.dart';
import '../../domain/repositories/governance_repository.dart';
import '../../domain/repositories/group_repository.dart';
import '../../domain/repositories/notification_repository.dart';
import '../../domain/repositories/profile_repository.dart';

const String _reason = 'SERVER_AUTHORITY_REQUIRED';

final class UnavailableAuthRepository implements AuthRepository {
  const UnavailableAuthRepository();

  @override
  Stream<Resource<AuthSession?>> watchSession() =>
      Stream<Resource<AuthSession?>>.value(
        const ResourceUnavailable<AuthSession?>(),
      );

  @override
  Future<OperationResult<void>> requestRegistration(String identityId) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<AccountStatus>> verifyRegistration({
    required String identityId,
    required String code,
  }) async => const OperationBlocked<AccountStatus>(_reason);

  @override
  Future<OperationResult<void>> requestLogin(String identityId) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<AuthSession>> completeLogin({
    required String identityId,
    required String code,
  }) async => const OperationBlocked<AuthSession>(_reason);

  @override
  Future<OperationResult<void>> requestRecovery(String identityId) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<void>> completeRecovery({
    required String identityId,
    required String code,
  }) async => const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<void>> signOut() async =>
      const OperationSuccess<void>(null);
}

final class UnavailableProfileRepository implements ProfileRepository {
  const UnavailableProfileRepository();

  @override
  Future<Resource<UserProfile>> loadProfile() async =>
      const ResourceUnavailable<UserProfile>();

  @override
  Future<OperationResult<UserProfile>> updateProfile({
    required String displayName,
    required String localeCode,
  }) async => const OperationBlocked<UserProfile>(_reason);

  @override
  Future<OperationResult<void>> changePin({
    required String currentPin,
    required String newPin,
  }) async => const OperationBlocked<void>(_reason);
}

final class UnavailableGroupRepository implements GroupRepository {
  const UnavailableGroupRepository();

  @override
  Future<Resource<List<GroupSummary>>> listGroups() async =>
      const ResourceUnavailable<List<GroupSummary>>();

  @override
  Future<Resource<GroupDetails>> getGroup(String groupId) async =>
      const ResourceUnavailable<GroupDetails>();

  @override
  Future<Resource<List<GroupMember>>> listMembers(String groupId) async =>
      const ResourceUnavailable<List<GroupMember>>();

  @override
  Future<Resource<GroupMember>> getMember(
    String groupId,
    String identityId,
  ) async => const ResourceUnavailable<GroupMember>();

  @override
  Future<Resource<CycleDetails>> getCycle(String groupId) async =>
      const ResourceUnavailable<CycleDetails>();

  @override
  Future<Resource<List<String>>> getRules(String groupId) async =>
      const ResourceUnavailable<List<String>>();

  @override
  Future<OperationResult<void>> joinGroup(String invitationCode) async =>
      const OperationBlocked<void>(_reason);

  @override
  Future<OperationResult<void>> inviteMember({
    required String groupId,
    required String phoneE164,
  }) async => const OperationBlocked<void>(_reason);
}

final class UnavailableContributionRepository
    implements ContributionRepository {
  const UnavailableContributionRepository();

  @override
  Future<Resource<List<Contribution>>> listHistory({String? groupId}) async =>
      const ResourceUnavailable<List<Contribution>>();

  @override
  Future<Resource<Contribution>> getContribution(String contributionId) async =>
      const ResourceUnavailable<Contribution>();

  @override
  Future<OperationResult<Contribution>> submitDraft(
    ContributionDraft draft,
  ) async => const OperationBlocked<Contribution>(_reason);
}

final class UnavailableGovernanceRepository implements GovernanceRepository {
  const UnavailableGovernanceRepository();

  @override
  Future<Resource<List<ValidationItem>>> listPendingValidations() async =>
      const ResourceUnavailable<List<ValidationItem>>();

  @override
  Future<Resource<ValidationItem>> getValidation(String contributionId) async =>
      const ResourceUnavailable<ValidationItem>();

  @override
  Future<OperationResult<void>> decideValidation({
    required String contributionId,
    required int expectedVersion,
    required ValidationDecision decision,
  }) async => const OperationBlocked<void>(_reason);

  @override
  Future<Resource<List<VoteSummary>>> listVotes() async =>
      const ResourceUnavailable<List<VoteSummary>>();

  @override
  Future<Resource<VoteDetails>> getVote(String voteId) async =>
      const ResourceUnavailable<VoteDetails>();

  @override
  Future<OperationResult<void>> castVote({
    required String voteId,
    required VoteChoice choice,
  }) async => const OperationBlocked<void>(_reason);
}

final class UnavailableDisputeRepository implements DisputeRepository {
  const UnavailableDisputeRepository();

  @override
  Future<Resource<List<DisputeSummary>>> listDisputes() async =>
      const ResourceUnavailable<List<DisputeSummary>>();

  @override
  Future<Resource<DisputeDetails>> getDispute(String disputeId) async =>
      const ResourceUnavailable<DisputeDetails>();

  @override
  Future<OperationResult<DisputeSummary>> openDispute({
    required String groupId,
    required String subject,
    required String description,
    String? relatedOperationId,
  }) async => const OperationBlocked<DisputeSummary>(_reason);
}

final class UnavailableNotificationRepository
    implements NotificationRepository {
  const UnavailableNotificationRepository();

  @override
  Future<Resource<List<KombeNotification>>> listNotifications() async =>
      const ResourceUnavailable<List<KombeNotification>>();

  @override
  Future<OperationResult<void>> markRead(String notificationId) async =>
      const OperationBlocked<void>(_reason);
}

final class UnavailableDocumentRepository implements DocumentRepository {
  const UnavailableDocumentRepository();

  @override
  Future<Resource<List<KombeDocument>>> listDocuments() async =>
      const ResourceUnavailable<List<KombeDocument>>();

  @override
  Future<Resource<List<KombeDocument>>> listExports() async =>
      const ResourceUnavailable<List<KombeDocument>>();
}

final class UnavailableDashboardRepository implements DashboardRepository {
  const UnavailableDashboardRepository();

  @override
  Future<Resource<DashboardData>> loadDashboard() async =>
      const ResourceUnavailable<DashboardData>();
}
