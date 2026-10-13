import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kombe_mobile/core/security/secure_session_store.dart';
import 'package:kombe_mobile/core/state/operation_result.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/data/remote/kombe_api_client.dart';
import 'package:kombe_mobile/data/remote/tontine_repositories.dart';
import 'package:kombe_mobile/domain/entities/auth.dart';
import 'package:kombe_mobile/domain/entities/contribution.dart';
import 'package:kombe_mobile/domain/entities/cycle.dart';
import 'package:kombe_mobile/domain/entities/dashboard.dart';
import 'package:kombe_mobile/domain/entities/governance.dart';
import 'package:kombe_mobile/domain/entities/group.dart';

/// Recettes CONTRACTUELLES des adaptateurs mobiles vers l'API « tontine
/// réelle » (I-07) : chemins exacts sous /v1, clé d'idempotence sur chaque
/// écriture, conversions sans flottant, et refus honnêtes là où l'API n'a
/// rien (votes, litiges). `MockClient` = frontière HTTP ; aucun serveur.

final class _MemoryStorage extends FlutterSecureStoragePlatform {
  final Map<String, String> store = <String, String>{};
  @override
  Future<void> write({required String key, required String value, required Map<String, String> options}) async => store[key] = value;
  @override
  Future<String?> read({required String key, required Map<String, String> options}) async => store[key];
  @override
  Future<bool> containsKey({required String key, required Map<String, String> options}) async => store.containsKey(key);
  @override
  Future<void> delete({required String key, required Map<String, String> options}) async => store.remove(key);
  @override
  Future<Map<String, String>> readAll({required Map<String, String> options}) async => Map<String, String>.of(store);
  @override
  Future<void> deleteAll({required Map<String, String> options}) async => store.clear();
}

final List<http.Request> calls = <http.Request>[];

KombeApiClient apiFor(Object? Function(http.Request req) route) => KombeApiClient(
      baseUrl: Uri.parse('https://kombe.test/v1'),
      client: MockClient((http.Request req) async {
        calls.add(req);
        final Object? body = route(req);
        if (body is http.Response) return body;
        return http.Response(jsonEncode(body), 200, headers: <String, String>{'content-type': 'application/json'});
      }),
    );

const Map<String, dynamic> tontine = <String, dynamic>{
  'groupId': 'grp_1',
  'name': 'Njangi Bonanjo',
  'state': 'active',
  'membershipId': 'mem_me',
  'membershipState': 'active',
  'roles': <String>['treasurer', 'member'],
  'memberCount': 4,
  'contributionPerShare': '5000',
  'nextMeetingDate': '2026-10-18',
  'myOpenDue': '6500',
  'myPayoutDate': null,
};

void main() {
  setUp(() {
    calls.clear();
    FlutterSecureStoragePlatform.instance = _MemoryStorage();
  });

  test('connexion par téléphone : code demandé, vérifié, session gardée', () async {
    final TontineAuthRepository repo = TontineAuthRepository(
      api: apiFor((http.Request r) => switch (r.url.path) {
            '/v1/auth/code-requests' => <String, dynamic>{'accepted': true, 'login': '+237677123456', 'channel': 'sms'},
            '/v1/auth/code-verifications' => <String, dynamic>{'sessionId': 'ses_1', 'expiresAt': 4102444800000, 'identityId': '+237677123456'},
            _ => http.Response('{}', 404),
          }),
      sessionStore: const SecureSessionStore(FlutterSecureStorage()),
    );
    expect(await repo.requestLogin('6 77 12 34 56'), isA<OperationSuccess<void>>());
    final OperationResult<AuthSession> r = await repo.completeLogin(identityId: '6 77 12 34 56', code: '123456');
    expect(r, isA<OperationSuccess<AuthSession>>());
    expect((r as OperationSuccess<AuthSession>).value.identityId, '+237677123456');
    // La vérification utilise le numéro canonique rendu par le serveur.
    expect(jsonDecode(calls[1].body), <String, dynamic>{'login': '+237677123456', 'code': '123456'});
    expect(calls.every((http.Request c) => c.headers.containsKey('idempotency-key')), isTrue);
  });

  test('mes tontines → résumés ; fonction la plus haute ; montants entiers', () async {
    final TontineGroupRepository repo = TontineGroupRepository(api: apiFor((_) => <dynamic>[tontine]));
    final Resource<List<GroupSummary>> r = await repo.listGroups();
    final GroupSummary g = (r as ResourceReady<List<GroupSummary>>).data.single;
    expect(calls.single.url.path, '/v1/me/tontines');
    expect(g.role, GroupRole.treasurer);
    expect(g.contributionAmountXaf, 5000);
    expect(g.nextDueAtUtc.toUtc().day, 18);
  });

  test('cycle : tours du serveur, tour courant = premier tour ouvert', () async {
    final TontineGroupRepository repo = TontineGroupRepository(
      api: apiFor((_) => <dynamic>[
            <String, dynamic>{'seq': 1, 'date': '2026-10-11', 'state': 'closed', 'beneficiaryName': 'Awa', 'payoutState': 'received'},
            <String, dynamic>{'seq': 2, 'date': '2026-10-18', 'state': 'open', 'beneficiaryName': 'Paul', 'payoutState': 'none'},
            <String, dynamic>{'seq': 3, 'date': '2026-10-25', 'state': 'open', 'beneficiaryName': 'Chantal', 'payoutState': 'none'},
          ]),
    );
    final CycleDetails c = ((await repo.getCycle('grp_1')) as ResourceReady<CycleDetails>).data;
    expect(calls.single.url.path, '/v1/tontines/grp_1/rounds');
    expect(c.currentTurn, 2);
    expect(c.beneficiaries.map((BeneficiaryTurn b) => b.status), <BeneficiaryStatus>[
      BeneficiaryStatus.received,
      BeneficiaryStatus.current,
      BeneficiaryStatus.upcoming,
    ]);
  });

  test('rejoindre : aperçu du code puis adhésion avec le nom du profil', () async {
    final TontineGroupRepository repo = TontineGroupRepository(
      api: apiFor((http.Request r) => switch (r.url.path) {
            '/v1/invitations/K7P2MNQX' => <String, dynamic>{'code': 'K7P2MNQX', 'groupName': 'Njangi', 'usable': true, 'alreadyMember': false},
            '/v1/me' => <String, dynamic>{'displayName': 'Awa'},
            '/v1/invitations/K7P2MNQX/join' => tontine,
            _ => http.Response('{}', 404),
          }),
    );
    expect(await repo.joinGroup('k7p2-mnqx'), isA<OperationSuccess<void>>());
    expect(jsonDecode(calls.last.body), <String, dynamic>{'displayName': 'Awa'});
  });

  test('brouillon : montant réparti sur les échéances (cagnotte d’abord), référence Mobile Money', () async {
    final TontineContributionRepository repo = TontineContributionRepository(
      api: apiFor((http.Request r) {
        if (r.url.path == '/v1/me/dues') {
          return <dynamic>[
            <String, dynamic>{'fundId': 'f_sol', 'fundKind': 'solidarity', 'roundSeq': 1, 'remaining': '1000', 'date': '2026-10-18'},
            <String, dynamic>{'fundId': 'f_rot', 'fundKind': 'rotation', 'roundSeq': 1, 'remaining': '5000', 'date': '2026-10-18'},
            <String, dynamic>{'fundId': 'f_rot', 'fundKind': 'rotation', 'roundSeq': 2, 'remaining': '5000', 'date': '2026-10-25'},
          ];
        }
        final Map<String, dynamic> b = jsonDecode(r.body) as Map<String, dynamic>;
        return <String, dynamic>{'movementId': 'mv_${b['fundId']}', 'fundId': b['fundId'], 'amount': b['amount'], 'state': 'declared', 'channel': b['channel'], 'declaredAt': '2026-10-13T10:00:00Z'};
      }),
    );
    final OperationResult<Contribution> r = await repo.submitDraft(ContributionDraft(
      localId: 'l1',
      groupId: 'grp_1',
      amountXaf: 6000,
      channel: PaymentChannel.orangeMoney,
      updatedAtUtc: DateTime.utc(2026, 10, 13),
      note: 'MP261013.1234.A56789',
    ));
    expect(r, isA<OperationSuccess<Contribution>>());
    final List<Map<String, dynamic>> posted =
        calls.where((http.Request c) => c.method == 'POST').map((http.Request c) => jsonDecode(c.body) as Map<String, dynamic>).toList();
    expect(posted.map((Map<String, dynamic> p) => '${p['fundId']}:${p['amount']}'), <String>['f_rot:5000', 'f_sol:1000']);
    expect(posted.every((Map<String, dynamic> p) => p['channel'] == 'orange_money' && p['reference'] == 'MP261013.1234.A56789'), isTrue);
  });

  test('validation : le trésorier confirme une déclaration qu’il peut confirmer', () async {
    final TontineGovernanceRepository repo = TontineGovernanceRepository(
      api: apiFor((http.Request r) {
        if (r.url.path == '/v1/me/tontines') return <dynamic>[tontine];
        if (r.url.path == '/v1/tontines/grp_1/movements') {
          return <dynamic>[
            <String, dynamic>{'movementId': 'mv_1', 'memberName': 'Paul', 'amount': '5000', 'declaredAt': '2026-10-13T09:00:00Z', 'can': <String, dynamic>{'confirm': true}},
            <String, dynamic>{'movementId': 'mv_mine', 'memberName': 'Moi', 'amount': '5000', 'declaredAt': '2026-10-13T09:00:00Z', 'can': <String, dynamic>{'confirm': false}},
          ];
        }
        return <dynamic>[];
      }),
    );
    final List<ValidationItem> items = ((await repo.listPendingValidations()) as ResourceReady<List<ValidationItem>>).data;
    expect(items.map((ValidationItem v) => v.contributionId), <String>['mv_1']);
    expect(await repo.decideValidation(contributionId: 'mv_1', expectedVersion: 1, decision: ValidationDecision.validate), isA<OperationSuccess<void>>());
    expect(calls.last.url.path, '/v1/tontines/grp_1/movements/confirmations');
    expect(jsonDecode(calls.last.body), <String, dynamic>{'movementIds': <String>['mv_1']});
    expect(await repo.listVotes(), isA<ResourceReady<List<VoteSummary>>>());
  });

  test('la chaîne de requête reste une requête (jamais encodée dans le chemin)', () async {
    final KombeApiClient api = apiFor((_) => <dynamic>[]);
    await api.get('/me/dues?groupId=grp_1');
    expect(calls.single.url.path, '/v1/me/dues');
    expect(calls.single.url.queryParameters, <String, String>{'groupId': 'grp_1'});
  });

  test('tableau de bord : progression du tour depuis mes échéances', () async {
    final TontineDashboardRepository repo = TontineDashboardRepository(
      api: apiFor((http.Request r) => switch (r.url.path) {
            '/v1/me/tontines' => <dynamic>[tontine],
            '/v1/me/dues' => <dynamic>[
                <String, dynamic>{'due': '5000', 'remaining': '2000', 'date': '2026-10-18'},
                <String, dynamic>{'due': '1500', 'remaining': '1500', 'date': '2026-10-18'},
              ],
            _ => <dynamic>[],
          }),
    );
    final DashboardData d = ((await repo.loadDashboard()) as ResourceReady<DashboardData>).data;
    expect(d.primaryGroup?.name, 'Njangi Bonanjo');
    expect(d.progressPercent, 46); // (6500 − 3500) × 100 / 6500, entier
  });
}
