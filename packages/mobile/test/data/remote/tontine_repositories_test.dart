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

/// Coffre Android en panne (clé Keystore perdue après une mise à jour,
/// chiffrement illisible) : chaque accès lève une exception de plateforme.
final class _BrokenStorage extends _MemoryStorage {
  @override
  Future<void> write({required String key, required String value, required Map<String, String> options}) async =>
      throw Exception('KeyStoreException');
  @override
  Future<String?> read({required String key, required Map<String, String> options}) async =>
      throw Exception('BadPaddingException');
  @override
  Future<void> delete({required String key, required Map<String, String> options}) async =>
      throw Exception('KeyStoreException');
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
      sessionStore: SecureSessionStore(const FlutterSecureStorage()),
    );
    expect(await repo.requestLogin('6 77 12 34 56'), isA<OperationSuccess<void>>());
    final OperationResult<AuthSession> r = await repo.completeLogin(identityId: '6 77 12 34 56', code: '123456');
    expect(r, isA<OperationSuccess<AuthSession>>());
    expect((r as OperationSuccess<AuthSession>).value.identityId, '+237677123456');
    // La vérification utilise le numéro canonique rendu par le serveur.
    expect(jsonDecode(calls[1].body), <String, dynamic>{'login': '+237677123456', 'code': '123456'});
    expect(calls.every((http.Request c) => c.headers.containsKey('idempotency-key')), isTrue);
  });

  test('coffre de l’appareil en panne : la connexion aboutit quand même', () async {
    FlutterSecureStoragePlatform.instance = _BrokenStorage();
    final SecureSessionStore store = SecureSessionStore(const FlutterSecureStorage());
    final KombeApiClient api = KombeApiClient(
      baseUrl: Uri.parse('https://kombe.test/v1'),
      sessionHeaders: () async {
        final String? raw = await store.readOpaqueSession();
        return raw == null ? const <String, String>{} : <String, String>{'authorization': 'Bearer ${jsonDecode(raw)['sessionId']}'};
      },
      client: MockClient((http.Request req) async {
        calls.add(req);
        final Object body = switch (req.url.path) {
          '/v1/auth/code-requests' => <String, dynamic>{'accepted': true, 'login': 'awa@example.cm', 'channel': 'email'},
          '/v1/auth/code-verifications' => <String, dynamic>{'sessionId': 'ses_9', 'expiresAt': 4102444800000, 'identityId': 'awa@example.cm'},
          _ => <String, dynamic>{'identityId': 'awa@example.cm', 'login': 'awa@example.cm'},
        };
        return http.Response(jsonEncode(body), 200, headers: <String, String>{'content-type': 'application/json'});
      }),
    );
    final TontineAuthRepository repo = TontineAuthRepository(api: api, sessionStore: store);
    // Avant : la lecture du coffre (en-têtes) levait, aucune requête ne partait.
    expect(await repo.requestLogin('awa@example.cm'), isA<OperationSuccess<void>>());
    expect(await repo.completeLogin(identityId: 'awa@example.cm', code: '123456'), isA<OperationSuccess<AuthSession>>());
    await api.get('/me');
    expect(calls.map((http.Request c) => c.url.path), <String>['/v1/auth/code-requests', '/v1/auth/code-verifications', '/v1/me']);
    // La session vit en mémoire : les appels suivants sont authentifiés.
    expect(calls.last.headers['authorization'], 'Bearer ses_9');
  });

  test('canaux : SMS fermé → connexion par e-mail seulement', () async {
    final TontineAuthRepository repo = TontineAuthRepository(
      api: apiFor((_) => <String, dynamic>{'sms': false, 'whatsapp': false, 'email': true, 'neonAuthUrl': null}),
      sessionStore: SecureSessionStore(const FlutterSecureStorage()),
    );
    expect(await repo.phoneLoginOpen(), isFalse);
    expect(calls.last.url.path, '/v1/auth/channels');
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

  group('déclaration', () {
    const List<Map<String, dynamic>> dues = <Map<String, dynamic>>[
      <String, dynamic>{'fundId': 'f_sol', 'fundKind': 'solidarity', 'fundName': 'Secours', 'roundSeq': 1, 'remaining': '1000', 'lateness': 'late'},
      <String, dynamic>{'fundId': 'f_rot', 'fundKind': 'rotation', 'fundName': 'Cagnotte', 'roundSeq': 1, 'remaining': '5000', 'lateness': 'late'},
      <String, dynamic>{'fundId': 'f_rot', 'fundKind': 'rotation', 'fundName': 'Cagnotte', 'roundSeq': 2, 'remaining': '5000', 'lateness': 'upcoming'},
    ];

    Future<List<OpenDue>> loadDues(TontineContributionRepository repo) async =>
        ((await repo.openDues('grp_1')) as ResourceReady<List<OpenDue>>).data;

    ContributionDraft draftWith(List<DeclarationLine> plan, {PaymentChannel channel = PaymentChannel.orangeMoney}) => ContributionDraft(
          localId: 'l1',
          groupId: 'grp_1',
          amountXaf: 6000,
          channel: channel,
          updatedAtUtc: DateTime.utc(2026, 10, 13),
          reference: 'MP261013.1234.A56789',
          plan: plan,
        );

    test('répartition : plus ancien tour, cagnotte d’abord ; référence distincte', () async {
      final TontineContributionRepository repo = TontineContributionRepository(
        api: apiFor((http.Request r) {
          if (r.url.path == '/v1/me/dues') return dues;
          final Map<String, dynamic> b = jsonDecode(r.body) as Map<String, dynamic>;
          return <String, dynamic>{'movementId': 'mv_${b['fundId']}_${b['roundSeq']}'};
        }),
      );
      final List<DeclarationLine> plan = planDeclaration(await loadDues(repo), 6000);
      expect(plan.map((DeclarationLine l) => '${l.fundId}:${l.roundSeq}:${l.amountXaf}'), <String>['f_rot:1:5000', 'f_sol:1:1000']);
      final DeclarationReceipt r = await repo.sendDeclaration(draftWith(plan));
      expect(r.complete, isTrue);
      final List<Map<String, dynamic>> posted =
          calls.where((http.Request c) => c.method == 'POST').map((http.Request c) => jsonDecode(c.body) as Map<String, dynamic>).toList();
      expect(posted.every((Map<String, dynamic> p) => p['reference'] == 'MP261013.1234.A56789' && !p.containsKey('justification')), isTrue);
    });

    test('excédent : refusé avant tout envoi (jamais déclaré en silence)', () async {
      final TontineContributionRepository repo = TontineContributionRepository(api: apiFor((_) => dues));
      expect(() => planDeclaration(<OpenDue>[], 1), throwsA(isA<AmountExceedsDue>()));
      expect(
        () async => planDeclaration(await loadDues(repo), 11001),
        throwsA(isA<AmountExceedsDue>().having((AmountExceedsDue e) => e.maxXaf, 'max', 11000)),
      );
    });

    test('coupure après une ligne : partiel honnête, reprise sans doublon (mêmes clés)', () async {
      int posts = 0;
      final Map<String, String> byKey = <String, String>{};
      final List<String> keys = <String>[];
      final KombeApiClient api = KombeApiClient(
        baseUrl: Uri.parse('https://kombe.test/v1'),
        client: MockClient((http.Request req) async {
          if (req.url.path == '/v1/me/dues') return http.Response(jsonEncode(dues), 200);
          final String key = req.headers['idempotency-key']!;
          keys.add(key);
          posts++;
          // 2e ligne du premier passage : la réponse se perd (réseau).
          if (posts == 2) throw http.ClientException('connexion perdue');
          // Le serveur rejoue la réponse mémorisée pour une clé déjà vue.
          final String id = byKey.putIfAbsent(key, () => 'mv_${byKey.length + 1}');
          return http.Response(jsonEncode(<String, dynamic>{'movementId': id}), 201);
        }),
      );
      final TontineContributionRepository repo = TontineContributionRepository(api: api);
      final List<DeclarationLine> plan = planDeclaration(await loadDues(repo), 6000);

      final DeclarationReceipt first = await repo.sendDeclaration(draftWith(plan));
      expect(first.complete, isFalse);
      expect(first.recordedCount, 1);
      expect(first.outcomeUnknown, isTrue);

      final DeclarationReceipt resumed = await repo.sendDeclaration(draftWith(first.lines));
      expect(resumed.complete, isTrue);
      // La ligne déjà enregistrée n'est pas renvoyée ; la ligne incertaine
      // est renvoyée avec LA MÊME clé.
      expect(keys.length, 3);
      expect(keys[2], keys[1]);
      expect(byKey.length, 2);
    });

    test('sans référence : le motif part comme justification', () async {
      final TontineContributionRepository repo = TontineContributionRepository(
        api: apiFor((http.Request r) => <String, dynamic>{'movementId': 'mv_1'}),
      );
      await repo.sendDeclaration(ContributionDraft(
        localId: 'l2',
        groupId: 'grp_1',
        amountXaf: 1000,
        channel: PaymentChannel.mtnMomo,
        updatedAtUtc: DateTime.utc(2026, 10, 13),
        noReferenceReason: 'SMS non reçu',
        plan: const <DeclarationLine>[DeclarationLine(fundId: 'f_sol', fundName: 'Secours', roundSeq: 1, amountXaf: 1000)],
      ));
      final Map<String, dynamic> body = jsonDecode(calls.single.body) as Map<String, dynamic>;
      expect(body['justification'], 'SMS non reçu');
      expect(body.containsKey('reference'), isFalse);
    });
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
  });

  test('votes de l’assemblée : scrutins ouverts listés, bulletin secret déposé', () async {
    final TontineGovernanceRepository repo = TontineGovernanceRepository(
      api: apiFor((http.Request r) {
        if (r.url.path == '/v1/me/tontines') return <dynamic>[tontine];
        if (r.url.path == '/v1/tontines/grp_1/decisions') {
          return <dynamic>[
            <String, dynamic>{
              'decisionId': 'dec_1', 'kind': 'pause', 'state': 'open', 'params': <String, dynamic>{'occurrences': 2},
              'reason': 'Fêtes de fin d’année', 'openedAt': '2026-10-13T09:00:00Z', 'closesAt': '2026-10-14T09:00:00Z',
              'electorate': 9, 'ballots': 3, 'myChoice': null, 'can': <String, dynamic>{'vote': true},
            },
            <String, dynamic>{'decisionId': 'dec_0', 'kind': 'exclusion', 'state': 'adopted', 'openedAt': '2026-10-01T09:00:00Z', 'closesAt': '2026-10-04T09:00:00Z'},
          ];
        }
        return <String, dynamic>{'decisionId': 'dec_1', 'state': 'open'};
      }),
    );
    final List<VoteSummary> votes = ((await repo.listVotes()) as ResourceReady<List<VoteSummary>>).data;
    expect(votes.map((VoteSummary v) => v.id), <String>['dec_1']);
    expect(votes.single.title, contains('Pause'));
    final VoteDetails d = ((await repo.getVote('dec_1')) as ResourceReady<VoteDetails>).data;
    expect((d.electorate, d.requiredYes, d.ballots), (9, 5, 3));
    expect(await repo.castVote(voteId: 'dec_1', choice: VoteChoice.forChoice), isA<OperationSuccess<void>>());
    expect(calls.last.url.path, '/v1/tontines/grp_1/decisions/dec_1/ballots');
    expect(jsonDecode(calls.last.body), <String, dynamic>{'choice': 'yes'});
    expect(calls.last.headers.containsKey('idempotency-key'), isTrue);
  });

  test('vote déjà clos (ouvert depuis la notification du résultat) : trouvé, résultat publié, pas de bulletin', () async {
    final TontineGovernanceRepository repo = TontineGovernanceRepository(
      api: apiFor((http.Request r) => switch (r.url.path) {
            '/v1/me/tontines' => <dynamic>[tontine],
            '/v1/tontines/grp_1/decisions' => <dynamic>[
                <String, dynamic>{
                  'decisionId': 'd9', 'kind': 'pause', 'state': 'adopted', 'params': <String, dynamic>{'occurrences': 2},
                  'reason': 'Fêtes de fin d’année', 'openedAt': '2026-10-01T10:00:00Z', 'closesAt': '2026-10-08T10:00:00Z',
                  'electorate': 12, 'ballots': 10, 'myChoice': 'yes',
                  'result': <String, dynamic>{'yes': 8, 'no': 1, 'abstain': 1},
                  'can': <String, dynamic>{'vote': false},
                },
              ],
            _ => <dynamic>[],
          }),
    );
    final VoteDetails v = ((await repo.getVote('d9')) as ResourceReady<VoteDetails>).data;
    expect(v.open, isFalse);
    expect(v.state, 'adopted');
    expect(v.result?.yes, 8);
    expect(v.myChoice, VoteChoice.forChoice);
    expect(v.canVote, isFalse);
  });

  test('la chaîne de requête reste une requête (jamais encodée dans le chemin)', () async {
    final KombeApiClient api = apiFor((_) => <dynamic>[]);
    await api.get('/me/dues?groupId=grp_1');
    expect(calls.single.url.path, '/v1/me/dues');
    expect(calls.single.url.queryParameters, <String, String>{'groupId': 'grp_1'});
  });

  test('accueil du groupe actif : reste dû, mes déclarations en attente, à confirmer, vote, séance — en parallèle', () async {
    final TontineDashboardRepository repo = TontineDashboardRepository(
      api: apiFor((http.Request r) {
        final String q = r.url.query;
        return switch (r.url.path) {
          '/v1/me/dues' => <dynamic>[
              <String, dynamic>{'fundId': 'f_rot', 'fundKind': 'rotation', 'fundName': 'Cagnotte', 'roundSeq': 2, 'remaining': '2000', 'date': '2026-10-18', 'lateness': 'late'},
              <String, dynamic>{'fundId': 'f_sol', 'fundKind': 'solidarity', 'fundName': 'Secours', 'roundSeq': 2, 'remaining': '0', 'date': '2026-10-11', 'lateness': 'on_time'},
            ],
          '/v1/tontines/grp_1' => <String, dynamic>{'nextMeeting': <String, dynamic>{'date': '2026-10-25', 'location': 'Chez Awa'}},
          '/v1/tontines/grp_1/movements' when q.contains('mine=1') => <dynamic>[
              <String, dynamic>{'kind': 'contribution', 'amount': '5000'},
            ],
          '/v1/tontines/grp_1/movements' => <dynamic>[
              <String, dynamic>{'movementId': 'a', 'can': <String, dynamic>{'confirm': true}},
              <String, dynamic>{'movementId': 'mine', 'can': <String, dynamic>{'confirm': false}},
            ],
          '/v1/tontines/grp_1/decisions' => <dynamic>[
              <String, dynamic>{'decisionId': 'd1', 'kind': 'pause', 'state': 'open', 'myChoice': null, 'closesAt': '2026-10-20T18:00:00Z', 'can': <String, dynamic>{'vote': true}},
              <String, dynamic>{'decisionId': 'd2', 'kind': 'pause', 'state': 'open', 'myChoice': 'yes', 'closesAt': '2026-10-20T18:00:00Z', 'can': <String, dynamic>{'vote': false}},
            ],
          '/v1/me/notifications' => <dynamic>[
              <String, dynamic>{'notificationId': '9', 'groupId': 'grp_2', 'kind': 'general', 'topic': 'fund', 'createdAt': '2026-10-13T10:00:00Z', 'read': false},
              <String, dynamic>{'notificationId': '8', 'groupId': 'grp_1', 'groupName': 'Njangi', 'kind': 'validation_waiting', 'topic': 'declared', 'subjectId': 'mv_7', 'createdAt': '2026-10-13T09:00:00Z', 'read': false},
            ],
          _ => <dynamic>[],
        };
      }),
    );
    final GroupSummary g = GroupSummary(
      id: 'grp_1', name: 'Njangi', role: GroupRole.treasurer, memberCount: 4, cycleIndex: 0, cycleTotal: 4,
      contributionAmountXaf: 5000, nextDueAtUtc: DateTime.utc(2026, 10, 18),
    );
    final HomeData d = ((await repo.loadHome(g)) as ResourceReady<HomeData>).data;
    expect(d.remainingXaf, 2000);
    expect(d.late, isTrue);
    expect(d.pendingDeclaredXaf, 5000);
    expect(d.toValidate, 1); // jamais sa propre déclaration
    expect(d.votes.map((PendingVote v) => v.id), <String>['d1']);
    expect(d.nextMeetingPlace, 'Chez Awa');
    // Seules les notifications du groupe actif, avec leur destination.
    expect(d.recent.single.subjectId, 'mv_7');
    expect(d.recent.single.title, 'Une déclaration attend votre confirmation');
    expect(calls.where((http.Request c) => c.url.path == '/v1/me/tontines'), isEmpty);
  });
}
