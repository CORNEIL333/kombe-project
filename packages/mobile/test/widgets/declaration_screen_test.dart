import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/domain/entities/contribution.dart';
import 'package:kombe_mobile/domain/repositories/contribution_repository.dart';
import 'package:kombe_mobile/domain/repositories/draft_repository.dart';
import 'package:kombe_mobile/features/contributions/contribution_start_screen.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';
import 'package:provider/provider.dart';

/// Envoi contrôlé par le test : on peut le laisser en suspens (double appui).
final class _Contributions implements ContributionRepository {
  int sends = 0;
  Completer<DeclarationReceipt>? pending;

  @override
  Future<Resource<List<OpenDue>>> openDues(String groupId) async => const ResourceReady<List<OpenDue>>(<OpenDue>[
        OpenDue(fundId: 'f_rot', fundName: 'Cagnotte', fundKind: 'rotation', roundSeq: 3, remainingXaf: 25000, late: true),
        OpenDue(fundId: 'f_sec', fundName: 'Secours', fundKind: 'solidarity', roundSeq: 3, remainingXaf: 1000, late: false),
      ]);

  @override
  Future<DeclarationReceipt> sendDeclaration(ContributionDraft draft) {
    sends++;
    pending = Completer<DeclarationReceipt>();
    return pending!.future;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

final class _Drafts implements ContributionDraftRepository {
  final Map<String, ContributionDraft> store = <String, ContributionDraft>{};
  @override
  Future<List<ContributionDraft>> listDrafts() async => store.values.toList();
  @override
  Future<ContributionDraft?> getDraft(String localId) async => store[localId];
  @override
  Future<void> upsertDraft(ContributionDraft draft) async => store[draft.localId] = draft;
  @override
  Future<void> deleteDraft(String localId) async => store.remove(localId);
  @override
  Future<void> purgeAll() async => store.clear();
}

Widget _app(_Contributions c, _Drafts d) => MaterialApp(
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
          Provider<ContributionRepository>.value(value: c),
          Provider<ContributionDraftRepository>.value(value: d),
        ],
        child: const ContributionStartScreen(groupId: 'grp_1'),
      ),
    );

/// Écran de téléphone (412 × 915 dp).
void _phone(WidgetTester tester) {
  tester.view.physicalSize = const Size(1236, 2745);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

void main() {
  testWidgets('montant proposé = reste dû ; excédent et référence manquante signalés au champ', (WidgetTester tester) async {
    _phone(tester);
    final _Contributions c = _Contributions();
    await tester.pumpWidget(_app(c, _Drafts()));
    await tester.pumpAndSettle();

    expect(find.text('Reste à régler'), findsOneWidget);
    expect(find.text('26000'), findsOneWidget); // proposé, modifiable
    expect(find.text('en retard'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, '30000');
    await tester.tap(find.text('Vérifier'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Au maximum'), findsOneWidget);
    expect(find.textContaining('Saisissez la référence'), findsOneWidget);
    expect(c.sends, 0);
  });

  testWidgets('double appui sur Envoyer : une seule déclaration, bouton verrouillé pendant l’envoi', (WidgetTester tester) async {
    _phone(tester);
    final _Contributions c = _Contributions();
    final _Drafts d = _Drafts();
    await tester.pumpWidget(_app(c, d));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField).at(1), 'MP26.1013.A5');
    await tester.tap(find.text('Vérifier'));
    await tester.pumpAndSettle();
    expect(find.text('Vérifier et envoyer'), findsOneWidget);

    await tester.tap(find.text('Envoyer la déclaration'));
    await tester.pump();
    // Deuxième appui pendant l'envoi : le bouton est désactivé (indicateur).
    expect(find.text('Envoyer la déclaration'), findsNothing);
    await tester.tap(find.byType(FilledButton).last, warnIfMissed: false);
    await tester.pump();
    expect(c.sends, 1);
    // Le plan est figé et enregistré AVANT l'envoi (reprise possible).
    expect(d.store.values.single.plan.length, 2);

    // Réponse perdue : issue inconnue, reprise proposée, brouillon gardé.
    c.pending!.complete(DeclarationReceipt(lines: d.store.values.single.plan, error: 'réseau', outcomeUnknown: true));
    await tester.pumpAndSettle();
    expect(find.text('Réponse non reçue'), findsOneWidget);
    expect(find.text('Reprendre l’envoi'), findsWidgets);
    expect(d.store.values.single.sending, isTrue);
  });
}
