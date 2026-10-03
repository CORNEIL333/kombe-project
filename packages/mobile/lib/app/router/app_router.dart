import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/biometric_setup_screen.dart';
import '../../features/auth/create_pin_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/recover_pin_screen.dart';
import '../../features/auth/recovery_verify_screen.dart';
import '../../features/auth/register_screen.dart';
import '../../features/auth/verify_phone_screen.dart';
import '../../features/auth/welcome_screen.dart';
import '../../features/contributions/contribution_detail_screen.dart';
import '../../features/contributions/contribution_evidence_screen.dart';
import '../../features/contributions/contribution_history_screen.dart';
import '../../features/contributions/contribution_review_screen.dart';
import '../../features/contributions/contribution_start_screen.dart';
import '../../features/disputes/dispute_screens.dart';
import '../../features/documents/document_screens.dart';
import '../../features/governance/vote_screens.dart';
import '../../features/groups/beneficiaries_screen.dart';
import '../../features/groups/cycle_screen.dart';
import '../../features/groups/group_detail_screen.dart';
import '../../features/groups/group_settings_screen.dart';
import '../../features/groups/groups_screen.dart';
import '../../features/groups/invite_member_screen.dart';
import '../../features/groups/join_group_screen.dart';
import '../../features/groups/member_detail_screen.dart';
import '../../features/groups/members_screen.dart';
import '../../features/groups/rules_screen.dart';
import '../../features/home/dashboard_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/offline/offline_status_screen.dart';
import '../../features/offline/server_required_screen.dart';
import '../../features/profile/edit_profile_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/settings/about_screen.dart';
import '../../features/settings/change_pin_screen.dart';
import '../../features/settings/language_screen.dart';
import '../../features/settings/more_screen.dart';
import '../../features/settings/notification_preferences_screen.dart';
import '../../features/settings/privacy_screen.dart';
import '../../features/settings/security_screen.dart';
import '../../features/support/support_screens.dart';
import '../../features/validation/validation_screens.dart';
import '../session_controller.dart';
import 'main_shell.dart';

final class AppRouter {
  AppRouter({required this.sessionController}) {
    router = GoRouter(
      initialLocation: '/',
      refreshListenable: sessionController,
      redirect: _redirect,
      routes: <RouteBase>[
        GoRoute(path: '/', builder: (_, __) => const WelcomeScreen()),
        GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
        GoRoute(path: '/register', builder: (_, __) => const RegisterScreen()),
        GoRoute(path: '/verify-phone', builder: (_, __) => const VerifyPhoneScreen()),
        GoRoute(path: '/create-pin', builder: (_, __) => const CreatePinScreen()),
        GoRoute(path: '/recover-pin', builder: (_, __) => const RecoverPinScreen()),
        GoRoute(path: '/recovery-verify', builder: (_, __) => const RecoveryVerifyScreen()),
        GoRoute(path: '/biometric-setup', builder: (_, __) => const BiometricSetupScreen()),
        GoRoute(path: '/server-required', builder: (_, __) => const ServerRequiredScreen()),
        StatefulShellRoute.indexedStack(
          builder: (context, state, navigationShell) =>
              MainShell(navigationShell: navigationShell),
          branches: <StatefulShellBranch>[
            StatefulShellBranch(
              routes: <RouteBase>[
                GoRoute(path: '/app', builder: (_, __) => const DashboardScreen()),
              ],
            ),
            StatefulShellBranch(
              routes: <RouteBase>[
                GoRoute(path: '/app/groups', builder: (_, __) => const GroupsScreen()),
              ],
            ),
            StatefulShellBranch(
              routes: <RouteBase>[
                GoRoute(
                  path: '/app/notifications',
                  builder: (_, __) => const NotificationsScreen(),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: <RouteBase>[
                GoRoute(path: '/app/more', builder: (_, __) => const MoreScreen()),
              ],
            ),
          ],
        ),
        GoRoute(path: '/app/groups/join', builder: (_, __) => const JoinGroupScreen()),
        GoRoute(
          path: '/app/groups/:groupId',
          builder: (_, state) => GroupDetailScreen(
            groupId: state.pathParameters['groupId']!,
          ),
        ),
        GoRoute(
          path: '/app/groups/:groupId/members',
          builder: (_, state) => MembersScreen(groupId: state.pathParameters['groupId']!),
        ),
        GoRoute(
          path: '/app/groups/:groupId/members/:identityId',
          builder: (_, state) => MemberDetailScreen(
            groupId: state.pathParameters['groupId']!,
            identityId: state.pathParameters['identityId']!,
          ),
        ),
        GoRoute(
          path: '/app/groups/:groupId/cycle',
          builder: (_, state) => CycleScreen(groupId: state.pathParameters['groupId']!),
        ),
        GoRoute(
          path: '/app/groups/:groupId/beneficiaries',
          builder: (_, state) => BeneficiariesScreen(
            groupId: state.pathParameters['groupId']!,
          ),
        ),
        GoRoute(
          path: '/app/groups/:groupId/rules',
          builder: (_, state) => RulesScreen(groupId: state.pathParameters['groupId']!),
        ),
        GoRoute(
          path: '/app/groups/:groupId/invite',
          builder: (_, state) => InviteMemberScreen(
            groupId: state.pathParameters['groupId']!,
          ),
        ),
        GoRoute(
          path: '/app/groups/:groupId/settings',
          builder: (_, state) => GroupSettingsScreen(
            groupId: state.pathParameters['groupId']!,
          ),
        ),
        GoRoute(
          path: '/app/groups/:groupId/contributions/new',
          builder: (_, state) => ContributionStartScreen(
            groupId: state.pathParameters['groupId']!,
            draftId: state.uri.queryParameters['draft'],
          ),
        ),
        GoRoute(
          path: '/app/groups/:groupId/contributions/:draftId/evidence',
          builder: (_, state) => ContributionEvidenceScreen(
            groupId: state.pathParameters['groupId']!,
            draftId: state.pathParameters['draftId']!,
          ),
        ),
        GoRoute(
          path: '/app/groups/:groupId/contributions/:draftId/review',
          builder: (_, state) => ContributionReviewScreen(
            groupId: state.pathParameters['groupId']!,
            draftId: state.pathParameters['draftId']!,
          ),
        ),
        GoRoute(path: '/app/contributions', builder: (_, __) => const ContributionHistoryScreen()),
        GoRoute(
          path: '/app/contributions/:contributionId',
          builder: (_, state) => ContributionDetailScreen(
            contributionId: state.pathParameters['contributionId']!,
          ),
        ),
        GoRoute(path: '/app/validations', builder: (_, __) => const ValidationQueueScreen()),
        GoRoute(
          path: '/app/validations/:contributionId',
          builder: (_, state) => ValidationDetailScreen(
            contributionId: state.pathParameters['contributionId']!,
          ),
        ),
        GoRoute(path: '/app/votes', builder: (_, __) => const VotesScreen()),
        GoRoute(
          path: '/app/votes/:voteId',
          builder: (_, state) => VoteDetailScreen(voteId: state.pathParameters['voteId']!),
        ),
        GoRoute(path: '/app/disputes', builder: (_, __) => const DisputesScreen()),
        GoRoute(path: '/app/disputes/new', builder: (_, __) => const CreateDisputeScreen()),
        GoRoute(
          path: '/app/disputes/:disputeId',
          builder: (_, state) => DisputeDetailScreen(
            disputeId: state.pathParameters['disputeId']!,
          ),
        ),
        GoRoute(path: '/app/profile', builder: (_, __) => const ProfileScreen()),
        GoRoute(path: '/app/profile/edit', builder: (_, __) => const EditProfileScreen()),
        GoRoute(path: '/app/settings/security', builder: (_, __) => const SecurityScreen()),
        GoRoute(path: '/app/settings/change-pin', builder: (_, __) => const ChangePinScreen()),
        GoRoute(path: '/app/settings/language', builder: (_, __) => const LanguageScreen()),
        GoRoute(
          path: '/app/settings/notifications',
          builder: (_, __) => const NotificationPreferencesScreen(),
        ),
        GoRoute(path: '/app/settings/privacy', builder: (_, __) => const PrivacyScreen()),
        GoRoute(path: '/app/documents', builder: (_, __) => const DocumentsScreen()),
        GoRoute(path: '/app/exports', builder: (_, __) => const ExportCenterScreen()),
        GoRoute(path: '/app/help', builder: (_, __) => const HelpCenterScreen()),
        GoRoute(path: '/app/support', builder: (_, __) => const ContactSupportScreen()),
        GoRoute(path: '/app/offline', builder: (_, __) => const OfflineStatusScreen()),
        GoRoute(path: '/app/about', builder: (_, __) => const AboutScreen()),
      ],
    );
  }

  final SessionController sessionController;
  late final GoRouter router;

  String? _redirect(BuildContext context, GoRouterState state) {
    final String path = state.uri.path;
    final bool secure = path == '/app' || path.startsWith('/app/');
    final bool authPath = path == '/' ||
        path == '/login' ||
        path == '/register' ||
        path == '/verify-phone' ||
        path == '/create-pin' ||
        path == '/recover-pin' ||
        path == '/recovery-verify' ||
        path == '/biometric-setup';

    if (sessionController.kind == SessionStateKind.signedIn && authPath) {
      return '/app';
    }

    if (!secure) return null;

    return switch (sessionController.kind) {
      SessionStateKind.signedIn => null,
      SessionStateKind.unavailable => '/server-required',
      SessionStateKind.signedOut => '/login',
      SessionStateKind.loading => '/login',
    };
  }

  void dispose() {
    router.dispose();
  }
}
