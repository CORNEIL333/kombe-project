import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/security/biometric_service.dart';
import '../../core/security/secure_session_store.dart';
import '../../data/local/contribution_draft_database.dart';
import '../../data/local/preferences_repository_impl.dart';
import '../../data/repositories/unavailable_repositories.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../../domain/repositories/dispute_repository.dart';
import '../../domain/repositories/document_repository.dart';
import '../../domain/repositories/draft_repository.dart';
import '../../domain/repositories/governance_repository.dart';
import '../../domain/repositories/group_repository.dart';
import '../../domain/repositories/notification_repository.dart';
import '../../domain/repositories/preferences_repository.dart';
import '../../domain/repositories/profile_repository.dart';

final class AppDependencies {
  AppDependencies({
    required this.authRepository,
    required this.profileRepository,
    required this.groupRepository,
    required this.contributionRepository,
    required this.governanceRepository,
    required this.disputeRepository,
    required this.notificationRepository,
    required this.documentRepository,
    required this.dashboardRepository,
    required this.draftRepository,
    required this.preferencesRepository,
    required this.biometricService,
    required this.secureSessionStore,
  });

  factory AppDependencies.unconfigured() {
    const FlutterSecureStorage secureStorage = FlutterSecureStorage();
    return AppDependencies(
      authRepository: const UnavailableAuthRepository(),
      profileRepository: const UnavailableProfileRepository(),
      groupRepository: const UnavailableGroupRepository(),
      contributionRepository: const UnavailableContributionRepository(),
      governanceRepository: const UnavailableGovernanceRepository(),
      disputeRepository: const UnavailableDisputeRepository(),
      notificationRepository: const UnavailableNotificationRepository(),
      documentRepository: const UnavailableDocumentRepository(),
      dashboardRepository: const UnavailableDashboardRepository(),
      draftRepository: ContributionDraftDatabase(),
      preferencesRepository: PreferencesRepositoryImpl(SharedPreferencesAsync()),
      biometricService: BiometricService(LocalAuthentication()),
      secureSessionStore: const SecureSessionStore(secureStorage),
    );
  }

  final AuthRepository authRepository;
  final ProfileRepository profileRepository;
  final GroupRepository groupRepository;
  final ContributionRepository contributionRepository;
  final GovernanceRepository governanceRepository;
  final DisputeRepository disputeRepository;
  final NotificationRepository notificationRepository;
  final DocumentRepository documentRepository;
  final DashboardRepository dashboardRepository;
  final ContributionDraftRepository draftRepository;
  final PreferencesRepository preferencesRepository;
  final BiometricService biometricService;
  final SecureSessionStore secureSessionStore;
}
