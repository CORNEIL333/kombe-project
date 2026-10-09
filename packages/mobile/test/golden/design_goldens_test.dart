// Golden tests du système KÓMBE (mandat §53) : rendent les écrans signature
// avec les VRAIES polices pour la QA visuelle. Les données ci-dessous sont des
// fixtures de design confinées à test/ — jamais importées par lib/.
// Régénérer : flutter test --update-goldens test/golden
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/core/design/kombe_theme.dart';
import 'package:kombe_mobile/core/widgets/cycle_orbit.dart';
import 'package:kombe_mobile/core/widgets/status_ring.dart';
import 'package:kombe_mobile/core/widgets/step_indicator.dart';
import 'package:kombe_mobile/core/widgets/transparency_card.dart';
import 'package:kombe_mobile/domain/entities/cycle.dart';
import 'package:kombe_mobile/domain/entities/dashboard.dart';
import 'package:kombe_mobile/domain/entities/group.dart';
import 'package:kombe_mobile/domain/entities/notification.dart';
import 'package:kombe_mobile/features/auth/welcome_screen.dart';
import 'package:kombe_mobile/features/contributions/contribution_sent_sheet.dart';
import 'package:kombe_mobile/features/groups/cycle_screen.dart';
import 'package:kombe_mobile/features/home/dashboard_content.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';

Future<void> _loadFonts() async {
  Future<void> family(String name, List<String> files) async {
    final FontLoader loader = FontLoader(name);
    for (final String f in files) {
      final List<int> bytes = File('assets/fonts/$f').readAsBytesSync();
      loader.addFont(Future<ByteData>.value(ByteData.sublistView(Uint8List.fromList(bytes))));
    }
    await loader.load();
  }

  await family('Manrope', <String>['Manrope-400.ttf', 'Manrope-500.ttf', 'Manrope-600.ttf', 'Manrope-700.ttf', 'Manrope-800.ttf']);
  await family('Fraunces', <String>['Fraunces-Display-500.ttf', 'Fraunces-Title-600.ttf']);
  // Icônes Material pour que les glyphes ne soient pas des carrés.
  final String? flutterRoot = Platform.environment['FLUTTER_ROOT'];
  final File icons = File('${flutterRoot ?? ''}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (icons.existsSync()) {
    final FontLoader l = FontLoader('MaterialIcons')
      ..addFont(Future<ByteData>.value(ByteData.sublistView(Uint8List.fromList(icons.readAsBytesSync()))));
    await l.load();
  }
}

Widget _app(Widget home) => MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: KombeTheme.light(),
      locale: const Locale('fr'),
      supportedLocales: const <Locale>[Locale('fr'), Locale('en')],
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (BuildContext context, Widget? child) =>
          MediaQuery(data: MediaQuery.of(context).copyWith(disableAnimations: true), child: child!),
      home: home,
    );

final DateTime _now = DateTime.utc(2026, 11, 10, 9);

final GroupSummary _group = GroupSummary(
  id: 'design-fixture',
  name: 'Les Étoiles de Yaoundé',
  role: GroupRole.member,
  memberCount: 12,
  cycleIndex: 4,
  cycleTotal: 12,
  contributionAmountXaf: 25000,
  nextDueAtUtc: _due,
);
final DateTime _due = DateTime.utc(2026, 11, 15);

Future<void> _phone(WidgetTester tester) async {
  tester.view.physicalSize = const Size(390 * 2, 844 * 2);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

void main() {
  setUpAll(_loadFonts);

  testWidgets('accueil — groupe actif', (WidgetTester tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app(Scaffold(
      body: SafeArea(
        child: DashboardContent(
          animate: false,
          onRefresh: () async {},
          data: DashboardData(
            primaryGroup: _group,
            nextContributionAtUtc: _due,
            currentMonthDeclaredXaf: 275000,
            progressPercent: 92,
            recentActivity: <KombeNotification>[
              KombeNotification(id: '1', kind: NotificationKind.validation, title: 'Paul A. — cotisation validée', body: 'Par le trésorier', createdAtUtc: _now, read: false),
              KombeNotification(id: '2', kind: NotificationKind.contribution, title: 'Marie A. a déclaré sa cotisation', body: 'En attente de validation', createdAtUtc: _now.subtract(const Duration(days: 1)), read: true),
              KombeNotification(id: '3', kind: NotificationKind.vote, title: 'Règles v3 acceptées', body: '12 membres sur 12', createdAtUtc: _now.subtract(const Duration(days: 5)), read: true),
            ],
          ),
        ),
      ),
    )));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/home_active_group.png'));
  });

  testWidgets('accueil — aucun groupe (état vide de marque)', (WidgetTester tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app(Scaffold(
      body: SafeArea(
        child: DashboardContent(
          animate: false,
          onRefresh: () async {},
          data: const DashboardData(primaryGroup: null, nextContributionAtUtc: null, currentMonthDeclaredXaf: 0, progressPercent: 0, recentActivity: <KombeNotification>[]),
        ),
      ),
    )));
    await tester.pumpAndSettle();
    expect(find.text('Rejoindre une tontine'), findsOneWidget);
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/home_no_group.png'));
  });

  testWidgets('cycle — orbite et ordre des bénéficiaires', (WidgetTester tester) async {
    await _phone(tester);
    final List<String> names = <String>['Paul A.', 'Amina T.', 'Serge N.', 'Marie A.', 'Linda M.', 'Chantal A.', 'Eric K.', 'Joëlle B.', 'Didier F.', 'Rose E.', 'Alain M.', 'Grâce O.'];
    await tester.pumpWidget(_app(Scaffold(
      appBar: AppBar(title: const Text('Cycle & bénéficiaires')),
      body: CycleView(
        animate: false,
        onSeeAll: () {},
        cycle: CycleDetails(
          id: 'c',
          groupId: 'design-fixture',
          currentTurn: 4,
          totalTurns: 12,
          beneficiaries: <BeneficiaryTurn>[
            for (int i = 0; i < 12; i++)
              BeneficiaryTurn(
                turnNumber: i + 1,
                identityId: 'm$i',
                displayName: names[i],
                dueAtUtc: DateTime.utc(2026, 8 + i, 25),
                status: i < 3 ? BeneficiaryStatus.received : i == 3 ? BeneficiaryStatus.current : BeneficiaryStatus.upcoming,
              ),
          ],
        ),
      ),
    )));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/cycle_detail.png'));
  });

  testWidgets('onboarding — premier temps', (WidgetTester tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app(const WelcomeScreen()));
    await tester.pumpAndSettle();
    expect(find.text('Se connecter'), findsOneWidget);
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/onboarding_1.png'));
    await tester.drag(find.byType(PageView), const Offset(-400, 0));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(PageView), const Offset(-400, 0));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/onboarding_3.png'));
  });

  testWidgets('statuts par la forme + orbite seule', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1160, 520);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(const Scaffold(
      body: Padding(
        padding: EdgeInsets.all(20),
        child: Row(
          children: <Widget>[
            KombeCycleOrbit(total: 8, current: 3, size: 200, animate: false, semanticLabel: 'Cycle de 8 tours'),
            SizedBox(width: 24),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                KombeStatusRing(status: KombeStatus.draft, label: 'Brouillon sur cet appareil'),
                SizedBox(height: 14),
                KombeStatusRing(status: KombeStatus.pending, label: 'En attente de validation'),
                SizedBox(height: 14),
                KombeStatusRing(status: KombeStatus.confirmed, label: 'Validée'),
                SizedBox(height: 14),
                KombeStatusRing(status: KombeStatus.disputed, label: 'Contestée'),
                SizedBox(height: 14),
                KombeStatusRing(status: KombeStatus.offline, label: 'Hors connexion'),
              ],
            ),
          ],
        ),
      ),
    )));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/status_grammar.png'));
  });

  testWidgets('cotisation — relecture transparente puis envoi', (WidgetTester tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app(Scaffold(
      appBar: AppBar(title: const Text('Relecture')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: const <Widget>[
          StepIndicator(current: 2, labels: <String>['Informations', 'Justificatif', 'Relecture']),
          SizedBox(height: 24),
          TransparencyCard(
            leading: KombeStatusRing(status: KombeStatus.draft, label: 'Brouillon sur cet appareil'),
            rows: <(String, String)>[
              ('Ce qui va se passer', 'Votre déclaration est envoyée au groupe.'),
              ('Qui doit valider', 'Un membre autorisé du groupe. Jusque-là, elle apparaît « en attente ».'),
              ('Où elle restera', 'Dans l’historique du groupe, avec sa date et son statut.'),
            ],
          ),
          SizedBox(height: 24),
          ContributionSentView(),
        ],
      ),
    )));
    await tester.pumpAndSettle();
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/contribution_flow.png'));
  });
}
