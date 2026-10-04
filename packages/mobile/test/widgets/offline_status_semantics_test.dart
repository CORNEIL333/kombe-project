import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/domain/entities/contribution.dart';
import 'package:kombe_mobile/domain/repositories/draft_repository.dart';
import 'package:kombe_mobile/features/offline/offline_status_screen.dart';
import 'package:provider/provider.dart';

/// Brouillons = dépôt local ; ici on le stubbe (le vrai utilise sqflite, absent
/// en test widget). Les capacités serveur, elles, dépendent uniquement de
/// OfflinePolicy (pur) — c'est ce qu'on veut auditer côté accessibilité.
class _FakeDraftRepository implements ContributionDraftRepository {
  @override
  Future<List<ContributionDraft>> listDrafts() async =>
      const <ContributionDraft>[];
  @override
  Future<ContributionDraft?> getDraft(String localId) async => null;
  @override
  Future<void> upsertDraft(ContributionDraft draft) async {}
  @override
  Future<void> deleteDraft(String localId) async {}
  @override
  Future<void> purgeAll() async {}
}

void main() {
  testWidgets(
    'indicateurs d\'état : le verdict est annoncé en texte (non-repli sur la couleur)',
    (WidgetTester tester) async {
      await tester.pumpWidget(
        Provider<ContributionDraftRepository>(
          create: (_) => _FakeDraftRepository(),
          child: const MaterialApp(home: OfflineStatusScreen()),
        ),
      );
      await tester.pumpAndSettle();

      // Les 4 actions serveur (validation, vote, rôle, règles) sont bloquées
      // hors connexion : chacune doit porter un libellé accessible (non-repli
      // sur la couleur/forme seule).
      final Finder blocked = find.byIcon(Icons.block);
      expect(blocked, findsNWidgets(4));
      for (final Element e in blocked.evaluate()) {
        expect(
          (e.widget as Icon).semanticLabel,
          'Non autorisé : validation du serveur requise',
        );
      }
      // Aucune capacité n'est autorisée hors connexion => pas d'icône "ok".
      expect(find.byIcon(Icons.check_circle), findsNothing);

      // Le compteur nu « 0 » est contextualisé pour un lecteur d'écran.
      expect(
        find.byWidgetPredicate(
          (Widget w) =>
              w is Semantics && w.properties.label == '0 brouillons',
        ),
        findsOneWidget,
      );
    },
  );
}
