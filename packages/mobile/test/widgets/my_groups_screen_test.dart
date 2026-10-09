import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/domain/repositories/group_repository.dart';
import 'package:kombe_mobile/features/groups/my_groups_screen.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';
import 'package:provider/provider.dart';

import '../support/fake_repositories.dart';

Widget _wrap(Widget child) => MaterialApp(
      locale: const Locale('fr'),
      supportedLocales: const <Locale>[Locale('fr'), Locale('en')],
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: child,
    );

/// C21 §2.5 — la vue consolidée « Mes tontines » doit réellement AFFICHER les
/// tontines servies par `GET /me/groups` (multi-adhésion), avec modèle ·
/// typologie · état d'adhésion, et la supervision parent quand elle existe.
/// Dépôt factice : deux adhésions actives.
void main() {
  testWidgets('MyGroupsScreen liste les tontines adhérentes + états',
      (WidgetTester tester) async {
    final FakeWorld world = FakeWorld();
    await tester.pumpWidget(
      _wrap(
        Provider<GroupRepository>(
          create: (_) => FakeGroupRepository(world),
          child: const MyGroupsScreen(),
        ),
      ),
    );
    // Chargement : Loading → resolution du Future (ResourceReady).
    await tester.pumpAndSettle();

    expect(find.text('Mes tontines'), findsOneWidget);
    expect(find.text('Les Étoiles de Yaoundé'), findsOneWidget);
    expect(find.text('Solidarité Bamiléké'), findsOneWidget);
    // Étiquette d'adhésion + modèle décodés côté écran (pas de champ financier).
    // FakeWorld sert 3 adhésions.
    expect(find.text('Membre actif'), findsNWidgets(3));
    expect(find.text('Famille'), findsNWidgets(3));
  });

  testWidgets('MyGroupsScreen affiche l’état vide honnête sans adhésion',
      (WidgetTester tester) async {
    final FakeWorld world = FakeWorld();
    world.groups.clear();
    await tester.pumpWidget(
      _wrap(
        Provider<GroupRepository>(
          create: (_) => FakeGroupRepository(world),
          child: const MyGroupsScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Aucune tontine'), findsOneWidget);
  });
}
