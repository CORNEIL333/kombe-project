import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/core/state/operation_result.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/domain/entities/auth.dart';
import 'package:kombe_mobile/domain/repositories/auth_repository.dart';
import 'package:kombe_mobile/domain/repositories/group_repository.dart';
import 'package:kombe_mobile/features/auth/code_request_form.dart';
import 'package:kombe_mobile/features/auth/verify_code_screen.dart';
import 'package:kombe_mobile/features/groups/invite_member_screen.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';
import 'package:provider/provider.dart';

import '../support/fake_repositories.dart';

final class _ChannelsAuth implements AuthRepository {
  _ChannelsAuth(this.channels);
  final AuthChannels channels;
  final List<LoginChannel> requested = <LoginChannel>[];

  @override
  Future<Resource<AuthChannels>> loadChannels() async => ResourceReady<AuthChannels>(channels);

  @override
  Future<OperationResult<void>> requestCode({required String login, required LoginChannel channel}) async {
    requested.add(channel);
    return const OperationSuccess<void>(null);
  }

  @override
  Future<OperationResult<AuthSession>> verifyCode({required String login, required String code}) async =>
      const OperationBlocked<AuthSession>('Code invalide');

  @override
  Future<OperationResult<void>> signOut() async => const OperationSuccess<void>(null);

  @override
  Stream<Resource<AuthSession?>> watchSession() => const Stream<Resource<AuthSession?>>.empty();
}

Widget _wrap(Widget child, {AuthRepository? auth, GroupRepository? groups}) => MaterialApp(
      locale: const Locale('fr'),
      supportedLocales: const <Locale>[Locale('fr'), Locale('en')],
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: MultiProvider(
        providers: <Provider<Object>>[
          if (auth != null) Provider<AuthRepository>.value(value: auth),
          if (groups != null) Provider<GroupRepository>.value(value: groups),
        ],
        child: Scaffold(body: child),
      ),
    );

void main() {
  testWidgets('production : e-mail seul — pas de choix de voie, champ e-mail', (WidgetTester tester) async {
    final _ChannelsAuth auth = _ChannelsAuth(const AuthChannels(email: true, sms: false, whatsapp: false));
    await tester.pumpWidget(_wrap(const CodeRequestForm(purpose: VerifyCodePurpose.login, submitLabel: 'Recevoir mon code'), auth: auth));
    await tester.pumpAndSettle();
    expect(find.byType(SegmentedButton<LoginChannel>), findsNothing);
    expect(find.text('Adresse e-mail'), findsOneWidget);
    expect(find.textContaining('par e-mail'), findsOneWidget);
  });

  testWidgets('SMS ouvert : la voie se choisit et le champ devient un numéro', (WidgetTester tester) async {
    final _ChannelsAuth auth = _ChannelsAuth(const AuthChannels(email: true, sms: true, whatsapp: false));
    await tester.pumpWidget(_wrap(const CodeRequestForm(purpose: VerifyCodePurpose.login, submitLabel: 'Recevoir mon code'), auth: auth));
    await tester.pumpAndSettle();
    expect(find.byType(SegmentedButton<LoginChannel>), findsOneWidget);
    await tester.tap(find.text('SMS'));
    await tester.pumpAndSettle();
    expect(find.text('Numéro de téléphone'), findsOneWidget);
  });

  testWidgets('code : « Renvoyer » attend 45 s puis renvoie par la même voie', (WidgetTester tester) async {
    final _ChannelsAuth auth = _ChannelsAuth(const AuthChannels(email: true, sms: false, whatsapp: false));
    await tester.pumpWidget(_wrap(
      const VerifyCodeScreen(purpose: VerifyCodePurpose.registration, identityId: 'a@b.cm'),
      auth: auth,
    ));
    await tester.pump();
    expect(find.text('Renvoyer le code (dans 45 s)'), findsOneWidget);
    expect(find.text('Ce premier code crée votre compte.'), findsOneWidget);
    await tester.pump(const Duration(seconds: 46));
    expect(find.text('Renvoyer le code'), findsOneWidget);
    await tester.tap(find.text('Renvoyer le code'));
    await tester.pump();
    expect(auth.requested, <LoginChannel>[LoginChannel.email]);
    expect(find.text('Renvoyer le code (dans 45 s)'), findsOneWidget);
    await tester.pump(const Duration(seconds: 46));
  });

  testWidgets('invitation : le code et le lien s’affichent avec Copier et WhatsApp', (WidgetTester tester) async {
    await tester.pumpWidget(_wrap(const InviteMemberScreen(groupId: 'essai-etoiles'), groups: FakeGroupRepository(FakeWorld())));
    expect(find.byType(TextField), findsNothing); // aucun numéro demandé
    await tester.tap(find.text('Créer un lien d’invitation'));
    await tester.pumpAndSettle();
    expect(find.text('ESSAI234'), findsOneWidget);
    expect(find.text('Partager sur WhatsApp'), findsOneWidget);
    expect(find.text('Copier le lien'), findsOneWidget);
    final Uri? wa = whatsappShareUri('Rejoins « Njangi » : https://x/#/rejoindre/AB');
    expect(wa?.scheme, 'https');
    expect(wa?.host, 'wa.me');
    expect(wa?.queryParameters['text'], 'Rejoins « Njangi » : https://x/#/rejoindre/AB');
  });
}
