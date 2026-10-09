// KÓMBE — MODE ESSAI : période de 30 jours, bandeau permanent, écran de fin.
// Importé uniquement par `lib/main_trial.dart` (voir trial_repositories.dart).
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app/di/app_dependencies.dart';
import '../core/design/kombe_colors.dart';
import '../core/design/kombe_theme.dart';
import '../core/design/kombe_tokens.g.dart';
import '../core/security/biometric_service.dart';
import '../core/security/secure_session_store.dart';
import '../core/widgets/kombe_mark.dart';
import '../data/local/contribution_draft_database.dart';
import '../data/local/preferences_repository_impl.dart';
import 'trial_repositories.dart';

const int kTrialDays = 30;
const String _startedKey = 'kombe_trial_started_at_utc';

/// État de la période d'essai. Démarre au premier lancement, sur cet appareil.
/// (Outil de test UI/UX : une réinstallation remet le compteur à zéro.)
final class TrialStatus {
  const TrialStatus(this.startedAtUtc, this.nowUtc);
  final DateTime startedAtUtc;
  final DateTime nowUtc;

  DateTime get endsAtUtc => startedAtUtc.add(const Duration(days: kTrialDays));
  bool get expired => !nowUtc.isBefore(endsAtUtc);
  int get daysLeft => expired ? 0 : (endsAtUtc.difference(nowUtc).inHours / 24).ceil();

  static Future<TrialStatus> load({SharedPreferencesAsync? prefs, DateTime? now}) async {
    final SharedPreferencesAsync p = prefs ?? SharedPreferencesAsync();
    final DateTime n = (now ?? DateTime.now()).toUtc();
    final String? raw = await p.getString(_startedKey);
    DateTime? started = raw == null ? null : DateTime.tryParse(raw)?.toUtc();
    // Horloge reculée sous la date de début : on ne prolonge pas l'essai.
    if (started == null || started.isAfter(n)) {
      started ??= n;
      await p.setString(_startedKey, started.toIso8601String());
    }
    return TrialStatus(started, n);
  }
}

AppDependencies trialDependencies() {
  final TrialWorld world = TrialWorld();
  const SecureSessionStore store = SecureSessionStore(FlutterSecureStorage());
  return AppDependencies(
    authRepository: TrialAuthRepository(),
    profileRepository: TrialProfileRepository(),
    groupRepository: TrialGroupRepository(world),
    contributionRepository: TrialContributionRepository(world),
    governanceRepository: TrialGovernanceRepository(world),
    disputeRepository: TrialDisputeRepository(world),
    notificationRepository: TrialNotificationRepository(world),
    documentRepository: TrialDocumentRepository(),
    dashboardRepository: TrialDashboardRepository(world),
    draftRepository: ContributionDraftDatabase(),
    preferencesRepository: PreferencesRepositoryImpl(SharedPreferencesAsync()),
    biometricService: BiometricService(LocalAuthentication()),
    secureSessionStore: store,
  );
}

/// Bandeau permanent : impossible de confondre l'essai avec de vraies données.
class TrialBanner extends StatelessWidget {
  const TrialBanner({required this.status, required this.child, super.key});
  final TrialStatus status;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final MediaQueryData mq = MediaQuery.of(context);
    return Column(
      children: <Widget>[
        Semantics(
          container: true,
          label: 'Mode essai, données fictives, ${status.daysLeft} jours restants',
          child: ExcludeSemantics(
            child: Container(
              width: double.infinity,
              color: KombeColors.forest,
              padding: EdgeInsets.fromLTRB(16, mq.padding.top + 4, 16, 6),
              child: Row(
                children: <Widget>[
                  Container(width: 8, height: 8, decoration: const BoxDecoration(color: KombeColors.gold, shape: BoxShape.circle)),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'MODE ESSAI · données fictives',
                      style: TextStyle(fontFamily: KombeTokens.fontUi, color: KombeColors.cream, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.2),
                    ),
                  ),
                  Text(
                    'J-${status.daysLeft}',
                    style: const TextStyle(fontFamily: KombeTokens.fontUi, color: KombeTokens.gold300, fontSize: 12, fontWeight: FontWeight.w800, fontFeatures: <FontFeature>[FontFeature.tabularFigures()]),
                  ),
                ],
              ),
            ),
          ),
        ),
        Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: child)),
      ],
    );
  }
}

/// Fin de l'essai : écran unique, sans accès aux données fictives.
class TrialExpiredApp extends StatelessWidget {
  const TrialExpiredApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'KÓMBE — essai terminé',
        theme: KombeTheme.light(),
        home: Builder(
          builder: (BuildContext context) {
            final TextTheme t = Theme.of(context).textTheme;
            return Scaffold(
              body: SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      const KombeMark(size: 64),
                      const SizedBox(height: 28),
                      Text('Votre période d’essai est terminée.', style: t.displaySmall),
                      const SizedBox(height: 12),
                      Text(
                        'Les $kTrialDays jours de test sont écoulés. Les données de cette version étaient fictives et '
                        'restent sur cet appareil. Pour continuer, installez la version officielle de KÓMBE.',
                        style: t.bodyLarge?.copyWith(color: KombeColors.slate),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      );
}
