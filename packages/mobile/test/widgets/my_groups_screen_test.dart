import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/app/active_group_controller.dart';
import 'package:kombe_mobile/app/session_controller.dart';
import 'package:kombe_mobile/domain/repositories/group_repository.dart';
import 'package:kombe_mobile/features/groups/my_groups_screen.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';
import 'package:provider/provider.dart';

import '../support/fake_repositories.dart';

Future<Widget> _app(FakeWorld world) async {
  final FakeGroupRepository repo = FakeGroupRepository(world);
  final ActiveGroupController groups = ActiveGroupController(
    repo,
    SessionController(FakeAuthRepository()),
    readChoice: () async => null,
    writeChoice: (_) async {},
  );
  await groups.refresh();
  return MaterialApp(
    locale: const Locale('fr'),
    supportedLocales: const <Locale>[Locale('fr'), Locale('en')],
    localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
      GlobalCupertinoLocalizations.delegate,
    ],
    home: MultiProvider(
      providers: <Provider<Object>>[Provider<GroupRepository>.value(value: repo)],
      child: ChangeNotifierProvider<ActiveGroupController>.value(value: groups, child: const MyGroupsScreen()),
    ),
  );
}

/// Onglet Groupes (planche) : toutes les tontines actives avec leur fonction,
/// la progression RÉELLE du cycle (servie par l'API) et la prochaine
/// cotisation ; état vide honnête sans adhésion.
void main() {
  testWidgets('liste les tontines, fonction, progression du cycle', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(1236, 2745);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final Widget app = await tester.runAsync(() => _app(FakeWorld())) as Widget;
    await tester.pumpWidget(app);
    await tester.pump(const Duration(seconds: 1)); // latence simulée du dépôt
    await tester.pumpAndSettle();

    expect(find.text('Mes groupes'), findsOneWidget);
    expect(find.text('Les Étoiles de Yaoundé'), findsOneWidget);
    expect(find.text('Solidarité Bamiléké'), findsOneWidget);
    expect(find.text('Cycle 4/12'), findsOneWidget);
    expect(find.text('Trésorerie'), findsWidgets);
    expect(find.text('À payer'), findsOneWidget);
  });

  testWidgets('état vide honnête sans adhésion', (WidgetTester tester) async {
    final FakeWorld world = FakeWorld()..groups.clear();
    final Widget app = await tester.runAsync(() => _app(world)) as Widget;
    await tester.pumpWidget(app);
    await tester.pump(const Duration(seconds: 1)); // latence simulée du dépôt
    await tester.pumpAndSettle();
    expect(find.text('Aucune tontine'), findsOneWidget);
  });
}
