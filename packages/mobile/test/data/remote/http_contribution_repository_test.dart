import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kombe_mobile/core/api/api_failure.dart';
import 'package:kombe_mobile/core/state/operation_result.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/data/remote/http_contribution_repository.dart';
import 'package:kombe_mobile/data/remote/kombe_api_client.dart';
import 'package:kombe_mobile/domain/entities/contribution.dart';

/// Recettes CONTRACTUELLES de l'adapteur HTTP cotisations : seules les routes
/// RÉELLEMENT persistées du contrat sont appelées (`POST /groups/{id}/declarations`,
/// prouvée base réelle), les en-têtes de commande (Idempotency-Key,
/// If-Match-Version) sont portés, le montant reste un entier XAF, le canal et la
/// date alléguée du contrat réel sont envoyés, et les codes d'erreur stables du
/// serveur sont propagés sans réinterprétation. La route FICTIVE
/// `/groups/{id}/contributions` n'est JAMAIS appelée.
/// `MockClient` = frontière HTTP simulée ; AUCUNE base ni serveur requis.
void main() {
  final draft = ContributionDraft(
    localId: 'd1',
    groupId: 'grpA',
    amountXaf: 15000,
    channel: PaymentChannel.mobileMoney,
    updatedAtUtc: DateTime.utc(2026, 10, 5),
  );

  HttpContributionRepository repoFor(
    Future<http.Response> Function(http.Request) handler, {
    ObligationIdResolver? obligation,
    ExpectedVersionResolver? version,
    IdempotencyKeyFactory? key,
    AllegedDateResolver? alleged,
  }) {
    return HttpContributionRepository(
      api: KombeApiClient(
        baseUrl: Uri.parse('https://api.kombe.test/v1'),
        client: MockClient((req) async => handler(req)),
      ),
      obligationIdResolver: obligation ?? ((_) => 'obl-42'),
      expectedVersionResolver: version ?? ((_) => 3),
      idempotencyKeyFactory: key ?? ((_) => 'idem-key-0001'),
      allegedDateResolver: alleged ?? ((_) => '2026-10-05'),
    );
  }

  /// Reçu RÉEL de `POST /declarations` (cf. serverRealMode.proof.mjs) : aucune
  /// ressource `Contribution`, mais un reçu de commande scellée en base.
  Map<String, dynamic> recuDeclaration() => <String, dynamic>{
        'commandId': 'cmd-idem-key-0001',
        'status': 'applied',
        'resultVersion': 4,
        'eventHash': 'e15f5d3fc7cca5dd',
        'obligationId': 'obl-42',
        'remainingDue': '100000',
        'availableToDeclare': '60000',
      };

  group('submitDraft → POST declarations (route réelle)', () {
    test('appelle la route réelle avec en-têtes, montant entier, canal et date',
        () async {
      late http.Request captured;
      final repo = repoFor((req) async {
        captured = req;
        return http.Response(jsonEncode(recuDeclaration()), 201);
      });

      final result = await repo.submitDraft(draft);

      expect(captured.method, 'POST');
      expect(captured.url.path, '/v1/groups/grpA/declarations');
      expect(captured.headers['Idempotency-Key'], 'idem-key-0001');
      expect(captured.headers['If-Match-Version'], '3');
      final body = jsonDecode(captured.body) as Map<String, dynamic>;
      expect(body['obligationId'], 'obl-42');
      expect(body['amount'], 15000);
      // mobile-money → canal électronique du contrat réel.
      expect(body['channel'], 'electronic');
      expect(body['allegedDate'], '2026-10-05');
      // Le montant circule en JSON sans point flottant (entier XAF, ADR-0002).
      expect(captured.body, contains('"amount":15000'));

      expect(result, isA<OperationSuccess<Contribution>>());
      final c = (result as OperationSuccess<Contribution>).value;
      // Le reçu ne porte pas de `contributionId` ressource : le `commandId`
      // serveur (identifiant réel de la commande scellée) sert d'`id`.
      expect(c.id, 'cmd-idem-key-0001');
      expect(c.groupId, 'grpA');
      expect(c.obligationId, 'obl-42');
      expect(c.amountXaf, 15000);
      expect(c.status, ContributionStatus.submitted); // reçu 'applied'
      expect(c.channel, PaymentChannel.mobileMoney); // canal envoyé, non inventé
      // L'horodatage serveur fait foi : le client ne le fabrique jamais.
      expect(c.declaredAtUtc, isNull);
    });

    test('rejeu idempotent (status duplicate) → cotisation soumise', () async {
      final repo = repoFor((_) async => http.Response(
            jsonEncode(<String, dynamic>{
              ...recuDeclaration(),
              'status': 'duplicate',
            }),
            200,
          ));

      final result = await repo.submitDraft(draft);
      final c = (result as OperationSuccess<Contribution>).value;
      expect(c.status, ContributionStatus.submitted);
    });

    test('propage l ErrorCode stable du serveur sur 403 sans réinterpréter',
        () async {
      final repo = repoFor((_) async => http.Response(
            jsonEncode({
              'code': 'FEATURE_PILOT_FORBIDDEN',
              'message': 'Accès refusé',
              'traceId': 't-9',
            }),
            403,
          ));

      final result = await repo.submitDraft(draft);

      expect(result, isA<OperationFailure<Contribution>>());
      final err = (result as OperationFailure<Contribution>).error as ApiFailure;
      expect(err.statusCode, 403);
      expect(err.code, 'FEATURE_PILOT_FORBIDDEN');
      expect(err.traceId, 't-9');
    });

    test('conflit de version (409) → ApiFailure CONFLICT explicite', () async {
      final repo = repoFor((_) async => http.Response(
            jsonEncode({'code': 'VERSION_CONFLICT', 'message': 'Obsolète'}),
            409,
          ));

      final result = await repo.submitDraft(draft);
      final err = (result as OperationFailure<Contribution>).error as ApiFailure;
      expect(err.statusCode, 409);
      expect(err.code, 'VERSION_CONFLICT');
    });

    test('obligation non résolue → refus client, aucun appel réseau', () async {
      var called = false;
      final repo = repoFor(
        (_) async {
          called = true;
          return http.Response('{}', 201);
        },
        obligation: (_) => null,
      );

      final result = await repo.submitDraft(draft);
      expect(result, isA<OperationFailure<Contribution>>());
      expect((result as OperationFailure<Contribution>).error,
          isA<ClientFailure>());
      expect(called, isFalse);
    });

    test('date alléguée absente → refus client, aucun appel réseau', () async {
      var called = false;
      final repo = repoFor(
        (_) async {
          called = true;
          return http.Response('{}', 201);
        },
        alleged: (_) => null,
      );

      final result = await repo.submitDraft(draft);
      expect((result as OperationFailure<Contribution>).error,
          isA<ClientFailure>());
      expect(called, isFalse);
    });

    test("clé d'idempotence trop courte → refus avant réseau", () async {
      final repo = repoFor((_) async => http.Response('{}', 201),
          key: (_) => 'short');
      final result = await repo.submitDraft(draft);
      expect((result as OperationFailure<Contribution>).error,
          isA<ClientFailure>());
    });
  });

  group('lecture : aucune route dans le contrat', () {
    test('listHistory et getContribution refusent sans inventer de route',
        () async {
      final repo = repoFor((_) async => http.Response('{}', 200));

      final hist = await repo.listHistory(groupId: 'grpA');
      expect(hist, isA<ResourceFailure<List<Contribution>>>());
      expect((hist as ResourceFailure<List<Contribution>>).error,
          isA<ClientFailure>());

      final one = await repo.getContribution('c-1');
      expect((one as ResourceFailure<Contribution>).error, isA<ClientFailure>());
    });
  });
}
