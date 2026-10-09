import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'package:provider/single_child_widget.dart';

import '../core/design/kombe_theme.dart';
import '../domain/repositories/auth_repository.dart';
import '../domain/repositories/contribution_repository.dart';
import '../domain/repositories/dashboard_repository.dart';
import '../domain/repositories/dispute_repository.dart';
import '../domain/repositories/document_repository.dart';
import '../domain/repositories/draft_repository.dart';
import '../domain/repositories/governance_repository.dart';
import '../domain/repositories/group_repository.dart';
import '../domain/repositories/notification_repository.dart';
import '../domain/repositories/profile_repository.dart';
import '../domain/repositories/preferences_repository.dart';
import '../l10n/app_localizations.dart';
import 'app_settings_controller.dart';
import 'di/app_dependencies.dart';
import 'router/app_router.dart';
import 'session_controller.dart';

class KombeApp extends StatefulWidget {
  const KombeApp({required this.dependencies, super.key, this.builder});
  final AppDependencies dependencies;

  /// Habillage optionnel autour de l'app (ex. bandeau du mode essai). Absent en production.
  final TransitionBuilder? builder;

  @override
  State<KombeApp> createState() => _KombeAppState();
}

class _KombeAppState extends State<KombeApp> {
  late final AppSettingsController _settings;
  late final SessionController _session;
  late final AppRouter _router;

  @override
  void initState() {
    super.initState();
    _settings = AppSettingsController(widget.dependencies.preferencesRepository);
    _session = SessionController(widget.dependencies.authRepository)..start();
    _router = AppRouter(sessionController: _session);
    _settings.initialize();
  }

  @override
  void dispose() {
    _router.dispose();
    _session.dispose();
    _settings.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: <SingleChildWidget>[
        Provider<AuthRepository>.value(value: widget.dependencies.authRepository),
        Provider<ProfileRepository>.value(value: widget.dependencies.profileRepository),
        Provider<GroupRepository>.value(value: widget.dependencies.groupRepository),
        Provider<ContributionRepository>.value(value: widget.dependencies.contributionRepository),
        Provider<GovernanceRepository>.value(value: widget.dependencies.governanceRepository),
        Provider<DisputeRepository>.value(value: widget.dependencies.disputeRepository),
        Provider<NotificationRepository>.value(value: widget.dependencies.notificationRepository),
        Provider<DocumentRepository>.value(value: widget.dependencies.documentRepository),
        Provider<DashboardRepository>.value(value: widget.dependencies.dashboardRepository),
        Provider<ContributionDraftRepository>.value(value: widget.dependencies.draftRepository),
        Provider<PreferencesRepository>.value(value: widget.dependencies.preferencesRepository),
        Provider.value(value: widget.dependencies.biometricService),
        ChangeNotifierProvider<AppSettingsController>.value(value: _settings),
        ChangeNotifierProvider<SessionController>.value(value: _session),
      ],
      child: AnimatedBuilder(
        animation: _settings,
        builder: (BuildContext context, Widget? child) => MaterialApp.router(
          debugShowCheckedModeBanner: false,
          title: 'KÓMBE',
          theme: KombeTheme.light(),
          locale: _settings.locale,
          supportedLocales: const <Locale>[Locale('fr'), Locale('en')],
          localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
            AppLocalizations.delegate,
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          routerConfig: _router.router,
          builder: widget.builder,
        ),
      ),
    );
  }
}
