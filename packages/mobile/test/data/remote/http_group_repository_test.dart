import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kombe_mobile/core/api/api_failure.dart';
import 'package:kombe_mobile/core/state/operation_result.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/data/remote/http_group_repository.dart';
import 'package:kombe_mobile/data/remote/kombe_api_client.dart';
import 'package:kombe_mobile/domain/entities/group.dart';

/// Recettes CONTRACTUELLES de l'adaptateur HTTP d'amorçage des tontines :
/// seules les routes RÉELLEMENT prouvées base réelle (0024,
/// `pgOnboardingStore.proof.mjs`) sont appelées ; les chemins sont des
/// segments NUS compilés sur la base `/v1` ; les décisions d'identité restent
/// serveur (le client ne choisit jamais son acteur) ; les lectures sans endpoint
/// GET renvoient [ResourceUnavailable] plutôt que d'inventer une source.
/// `MockClient` = frontière HTTP simulée ; AUCUNE base ni serveur requis.
void main() {
  HttpGroupRepository repoFor(
    Future<http.Response> Function(http.Request) handler,
  ) =>
      HttpGroupRepository(
        api: KombeApiClient(
          baseUrl: Uri.parse('https://api.kombe.test/v1'),
          client: MockClient((req) async => handler(req)),
        ),
      );

  group('createGroup → POST /groups', () {
    test('porte nom, modèle, typologie et renvoie le groupId SERVEUR', () async {
      late http.Request captured;
      final repo = repoFor((req) async {
        captured = req;
        return http.Response(
            jsonEncode(<String, dynamic>{'groupId': 'grp-serveur-42'}), 201);
      });

      final result = await repo.createGroup(
        groupId: 'grp-client-1',
        displayName: 'Tontine des artisans',
        tontineModel: 'famille',
        rotationType: 'rotative_fermee',
      );

      expect(captured.method, 'POST');
      expect(captured.url.path, '/v1/groups');
      final body = jsonDecode(captured.body) as Map<String, dynamic>;
      expect(body['displayName'], 'Tontine des artisans');
      expect(body['tontineModel'], 'famille');
      expect(body['rotationType'], 'rotative_fermee');
      expect(body.containsKey('parentGroupId'), isFalse);
      expect(result, isA<OperationSuccess<String>>());
      // L'identifiant retenu est celui du serveur, pas celui proposé.
      expect((result as OperationSuccess<String>).value, 'grp-serveur-42');
    });

    test('parent de supervision transmis seulement s’il est renseigné',
        () async {
      late http.Request captured;
      final repo = repoFor((req) async {
        captured = req;
        return http.Response(jsonEncode({'groupId': 'g'}), 201);
      });

      await repo.createGroup(
        groupId: 'g1',
        displayName: 'Sous-tontine',
        tontineModel: 'personnalise',
        rotationType: 'rotative_fermee',
        parentGroupId: 'grp-federation',
      );
      final body = jsonDecode(captured.body) as Map<String, dynamic>;
      expect(body['parentGroupId'], 'grp-federation');
    });

    test('propage l’ErrorCode serveur (422) sans réinterpréter', () async {
      final repo = repoFor((_) async => http.Response(
            jsonEncode({
              'code': 'ROTATION_TYPE_NOT_READY',
              'message': 'typologie P1 non démarrable',
            }),
            422,
          ));

      final result = await repo.createGroup(
        groupId: 'g1',
        displayName: 'X',
        tontineModel: 'famille',
        rotationType: 'tirage',
      );

      expect(result, isA<OperationFailure<String>>());
      final err = (result as OperationFailure<String>).error as ApiFailure;
      expect(err.statusCode, 422);
      expect(err.code, 'ROTATION_TYPE_NOT_READY');
    });
  });

  group('listDiscoverable → GET /discoverable-groups', () {
    test('tableau JSON de premier niveau enveloppé sous items puis décodé',
        () async {
      final repo = repoFor((req) async {
        expect(req.method, 'GET');
        expect(req.url.path, '/v1/discoverable-groups');
        return http.Response(
          jsonEncode(<Map<String, dynamic>>[
            <String, dynamic>{
              'groupId': 'grpA',
              'groupName': 'Tontine A',
              'tontineModel': 'famille',
              'rotationType': 'rotative_fermee',
            },
          ]),
          200,
        );
      });

      final result = await repo.listDiscoverable();
      expect(result, isA<ResourceReady<List<DiscoverableGroup>>>());
      final list = (result as ResourceReady<List<DiscoverableGroup>>).data;
      expect(list.single.groupId, 'grpA');
      expect(list.single.name, 'Tontine A');
      expect(list.single.tontineModel, 'famille');
    });
  });

  group('parrainage / adhésion', () {
    test('requestSponsorship → POST /groups/{id}/sponsorships', () async {
      late http.Request captured;
      final repo = repoFor((req) async {
        captured = req;
        return http.Response('{}', 201);
      });

      final result = await repo.requestSponsorship(
        groupId: 'grpA',
        sponsorshipId: 'spn-1',
        candidateId: 'id-candidate',
        sponsorId: 'id-sponsor',
      );

      expect(captured.method, 'POST');
      expect(captured.url.path, '/v1/groups/grpA/sponsorships');
      final body = jsonDecode(captured.body) as Map<String, dynamic>;
      expect(body['sponsorshipId'], 'spn-1');
      expect(body['sponsorId'], 'id-sponsor');
      expect(result, isA<OperationSuccess<void>>());
    });

    test('joinGroup → POST /invitations/{code}/redemptions', () async {
      late http.Request captured;
      final repo = repoFor((req) async {
        captured = req;
        return http.Response('{}', 200);
      });

      final result = await repo.joinGroup('CODE-123');
      expect(captured.method, 'POST');
      expect(captured.url.path, '/v1/invitations/CODE-123/redemptions');
      expect(result, isA<OperationSuccess<void>>());
    });

    test('inviteMember → POST /groups/{id}/memberships (handle)', () async {
      late http.Request captured;
      final repo = repoFor((req) async {
        captured = req;
        return http.Response('{}', 201);
      });

      await repo.inviteMember(groupId: 'grpA', phoneE164: '+237600000000');
      expect(captured.url.path, '/v1/groups/grpA/memberships');
      final body = jsonDecode(captured.body) as Map<String, dynamic>;
      expect(body['handle'], '+237600000000');
    });
  });

  group('lecture sans endpoint GET : honnête, non inventée', () {
    test('listGroups/getGroup/listMembers/getCycle → ResourceUnavailable',
        () async {
      final repo = repoFor((_) async => http.Response('{}', 200));
      expect(await repo.listGroups(), isA<ResourceUnavailable<List<GroupSummary>>>());
      expect(await repo.getGroup('g'), isA<ResourceUnavailable<GroupDetails>>());
      expect(await repo.listMembers('g'), isA<ResourceUnavailable<List<GroupMember>>>());
      expect(await repo.getCycle('g'), isA<ResourceUnavailable>());
    });
  });
}
