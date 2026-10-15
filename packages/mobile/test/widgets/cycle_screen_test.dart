import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/domain/entities/group.dart';
import 'package:kombe_mobile/domain/repositories/group_repository.dart';
import 'package:kombe_mobile/features/groups/cycle_screen.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';
import 'package:provider/provider.dart';

import '../support/fake_repositories.dart';

Widget _wrap(Widget child, GroupRepository repo) => MaterialApp(
      locale: const Locale('fr'),
      supportedLocales: const <Locale>[Locale('fr'), Locale('en')],
      localizationsDelegates: const <LocalizationsDelegate<dynamic>>[
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Provider<GroupRepository>(
        create: (_) => repo,
        child: child,
      ),
    );

GroupSummary _groupeAvecCycle(int total, GroupRole role) => GroupSummary(
      id: 'essai-etoiles',
      name: 'Les Étoiles de Yaoundé',
      role: role,
      memberCount: 12,
      cycleIndex: total == 0 ? 0 : 1,
      cycleTotal: total,
      contributionAmountXaf: 25000,
      nextDueAtUtc: DateTime.utc(2026, 11, 25),
    );

void main() {
  testWidgets('Cycle non démarré : le bureau voit le choix d’ordre et lance le cycle', (WidgetTester tester) async {
    final FakeWorld world = FakeWorld();
    world.groups[0] = _groupeAvecCycle(0, GroupRole.administrator);
    final FakeGroupRepository repo = FakeGroupRepository(world);
    await tester.pumpWidget(_wrap(const CycleScreen(groupId: 'essai-etoiles'), repo));
    await tester.pumpAndSettle();

    expect(find.text('Le cycle n’est pas encore lancé'), findsOneWidget);
    expect(find.text('Tirage au sort vérifiable'), findsOneWidget);
    expect(find.text('Ordre d’arrivée'), findsOneWidget);
    expect(find.text('Lancer le cycle'), findsOneWidget);

    await tester.ensureVisible(find.text('Lancer le cycle'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Lancer le cycle'));
    await tester.pumpAndSettle();

    // Le cycle est prêt : la progression et l'ordre des bénéficiaires s'affichent.
    expect(find.text('Progression du cycle'), findsOneWidget);
    expect(find.text('Ordre des bénéficiaires'), findsOneWidget);
  });

  testWidgets('Cycle non démarré : le membre voit l’explication, sans bouton de lancement', (WidgetTester tester) async {
    final FakeWorld world = FakeWorld();
    world.groups[0] = _groupeAvecCycle(0, GroupRole.member);
    await tester.pumpWidget(_wrap(const CycleScreen(groupId: 'essai-etoiles'), FakeGroupRepository(world)));
    await tester.pumpAndSettle();

    expect(find.text('Le cycle n’est pas encore lancé'), findsOneWidget);
    expect(find.text('Lancer le cycle'), findsNothing);
    expect(find.text('Seuls le président, le vice-président ou le secrétaire général peuvent lancer le cycle.'), findsOneWidget);
  });

  testWidgets('Cycle lancé : pas de panneau de lancement', (WidgetTester tester) async {
    final FakeWorld world = FakeWorld();
    world.groups[0] = _groupeAvecCycle(12, GroupRole.administrator);
    await tester.pumpWidget(_wrap(const CycleScreen(groupId: 'essai-etoiles'), FakeGroupRepository(world)));
    await tester.pumpAndSettle();

    expect(find.text('Progression du cycle'), findsOneWidget);
    expect(find.text('Le cycle n’est pas encore lancé'), findsNothing);
    // Aucun tour reçu : le renouvellement ne se propose pas encore.
    expect(find.text('Lancer le nouveau cycle'), findsNothing);
  });

  testWidgets('Saison terminée : le bureau peut lancer le cycle suivant', (WidgetTester tester) async {
    final FakeWorld world = FakeWorld();
    // Le fake sert tous les tours « reçus » quand cycleIndex > cycleTotal.
    world.groups[0] = GroupSummary(
      id: 'essai-etoiles',
      name: 'Les Étoiles de Yaoundé',
      role: GroupRole.administrator,
      memberCount: 12,
      cycleIndex: 4,
      cycleTotal: 3,
      contributionAmountXaf: 25000,
      nextDueAtUtc: DateTime.utc(2026, 11, 25),
    );
    await tester.pumpWidget(_wrap(const CycleScreen(groupId: 'essai-etoiles'), FakeGroupRepository(world)));
    await tester.pumpAndSettle();

    expect(find.text('Saison terminée — lancez la suivante'), findsOneWidget);
    expect(find.text('Lancer le nouveau cycle'), findsOneWidget);
  });
}
