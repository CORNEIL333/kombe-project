import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/security/biometric_service.dart';
import '../../core/security/secure_session_store.dart';
import '../../data/local/contribution_draft_database.dart';
import '../../data/local/preferences_repository_impl.dart';
import '../../data/remote/kombe_api_client.dart';
import '../../data/remote/stored_session_codec.dart';
import '../../data/remote/tontine_repositories.dart';
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
      preferencesRepository: PreferencesRepositoryImpl(
        SharedPreferencesAsync(),
      ),
      biometricService: BiometricService(LocalAuthentication()),
      secureSessionStore: const SecureSessionStore(secureStorage),
    );
  }

  /// Mode RÉEL : tous les dépôts parlent à l'API « tontine réelle »
  /// (docs/API_TONTINE.md), la même que la PWA — connexion par téléphone ou
  /// e-mail, groupes, cotisations, validation, notifications, statuts, tableau
  /// de bord (`tontine_repositories.dart`, I-07).
  /// `apiBaseUrl` est lue par l'appelant (`main.dart`) depuis
  /// `--dart-define=KOMBE_API_BASE_URL` — absente par défaut (voir
  /// `AppDependencies.unconfigured`), jamais devinée.
  factory AppDependencies.configured({required Uri apiBaseUrl}) {
    const FlutterSecureStorage secureStorage = FlutterSecureStorage();
    const SecureSessionStore secureSessionStore = SecureSessionStore(
      secureStorage,
    );
    // Le 401 purge la session et renvoie à la connexion (câblage tardif :
    // le dépôt d'auth n'existe pas encore quand le client est construit).
    late final TontineAuthRepository authRepository;
    final KombeApiClient api = KombeApiClient(
      baseUrl: apiBaseUrl,
      sessionHeaders: () async {
        final StoredSession? stored = decodeStoredSession(
          await secureSessionStore.readOpaqueSession(),
        );
        if (stored == null || stored.isExpired) return const <String, String>{};
        return <String, String>{'authorization': 'Bearer ${stored.sessionId}'};
      },
      onUnauthorized: () => authRepository.purgeRejectedSession(),
    );
    authRepository = TontineAuthRepository(api: api, sessionStore: secureSessionStore);
    // Adresse du site web (PWA) : même hôte que l'API, sans le préfixe /v1.
    final Uri webBase = apiBaseUrl.replace(
      path: apiBaseUrl.path.replaceFirst(RegExp(r'/v1/?$'), '/'),
    );
    return AppDependencies(
      authRepository: authRepository,
      profileRepository: TontineProfileRepository(api: api),
      groupRepository: TontineGroupRepository(api: api),
      contributionRepository: TontineContributionRepository(api: api),
      governanceRepository: TontineGovernanceRepository(api: api),
      disputeRepository: const TontineDisputeRepository(),
      notificationRepository: TontineNotificationRepository(api: api),
      documentRepository: TontineDocumentRepository(api: api, webBase: webBase),
      dashboardRepository: TontineDashboardRepository(api: api),
      draftRepository: ContributionDraftDatabase(),
      preferencesRepository: PreferencesRepositoryImpl(
        SharedPreferencesAsync(),
      ),
      biometricService: BiometricService(LocalAuthentication()),
      secureSessionStore: secureSessionStore,
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
