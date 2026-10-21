import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kombe_mobile/core/api/api_failure.dart';
import 'package:kombe_mobile/core/security/secure_session_store.dart';
import 'package:kombe_mobile/core/state/operation_result.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/core/widgets/operation_feedback.dart';
import 'package:kombe_mobile/data/remote/kombe_api_client.dart';
import 'package:kombe_mobile/data/remote/tontine_repositories.dart';
import 'package:kombe_mobile/domain/entities/auth.dart';
import 'package:kombe_mobile/domain/entities/contribution.dart';
import 'package:kombe_mobile/domain/entities/cycle.dart';
import 'package:kombe_mobile/domain/entities/dashboard.dart';
import 'package:kombe_mobile/domain/entities/governance.dart';
import 'package:kombe_mobile/domain/entities/group.dart';
import 'package:kombe_mobile/domain/entities/notification.dart';

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

final class SocketLikeException implements Exception {
  const SocketLikeException();
}

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

  test('connexion par téléphone : voie envoyée, code vérifié, session gardée', () async {
    final TontineAuthRepository repo = TontineAuthRepository(
      api: apiFor((http.Request r) => switch (r.url.path) {
            '/v1/auth/code-requests' => <String, dynamic>{'accepted': true, 'login': '+237677123456', 'channel': 'sms'},
            '/v1/auth/code-verifications' => <String, dynamic>{'sessionId': 'ses_1', 'expiresAt': 4102444800000, 'identityId': '+237677123456'},
            _ => http.Response('{}', 404),
          }),
      sessionStore: const SecureSessionStore(FlutterSecureStorage()),
    );
    expect(await repo.requestCode(login: '6 77 12 34 56', channel: LoginChannel.sms), isA<OperationSuccess<void>>());
    expect(jsonDecode(calls[0].body), <String, dynamic>{'login': '6 77 12 34 56', 'channel': 'sms'});
    final OperationResult<AuthSession> r = await repo.verifyCode(login: '6 77 12 34 56', code: '123456');
    expect(r, isA<OperationSuccess<AuthSession>>());
    expect((r as OperationSuccess<AuthSession>).value.identityId, '+237677123456');
    // La vérification utilise le numéro canonique rendu par le serveur.
    expect(jsonDecode(calls[1].body), <String, dynamic>{'login': '+237677123456', 'code': '123456'});
    expect(calls.every((http.Request c) => c.headers.containsKey('idempotency-key')), isTrue);
  });

  test('voies de connexion : seules les voies ouvertes sont proposées', () async {
    final TontineAuthRepository repo = TontineAuthRepository(
      api: apiFor((_) => <String, dynamic>{'sms': false, 'whatsapp': false, 'email': true, 'neonAuthUrl': null}),
      sessionStore: const SecureSessionStore(FlutterSecureStorage()),
    );
    final AuthChannels c = ((await repo.loadChannels()) as ResourceReady<AuthChannels>).data;
    expect(calls.single.url.path, '/v1/auth/channels');
    expect(c.open, <LoginChannel>[LoginChannel.email]);
    expect(authChannelsFrom(<String, dynamic>{'sms': true, 'whatsapp': true, 'email': true}).open,
        <LoginChannel>[LoginChannel.email, LoginChannel.sms, LoginChannel.whatsapp]);
  });

  test('erreur réseau : message clair en français, jamais le code technique', () async {
    final KombeApiClient api = KombeApiClient(
      baseUrl: Uri.parse('https://kombe.test/v1'),
      client: MockClient((_) async => throw const SocketLikeException()),
    );
    final TontineAuthRepository repo = TontineAuthRepository(api: api, sessionStore: const SecureSessionStore(FlutterSecureStorage()));
    final OperationResult<void> r = await repo.requestCode(login: 'a@b.cm', channel: LoginChannel.email);
    expect(outcomeMessage(r), 'Pas de connexion au serveur KÓMBE. Vérifiez votre réseau et réessayez.');
    expect(failureMessage(const ApiFailure(statusCode: 409, code: 'RULES_NOT_ACCEPTED', message: 'Statuts pas encore acceptés par : Awa')),
        'Statuts pas encore acceptés par : Awa');
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

  test('notification : groupe, cible et paramètres gardés ; titre, détail et route', () {
    final KombeNotification n = TontineNotificationRepository.notification(<String, dynamic>{
      'notificationId': '42',
      'groupId': 'grp_1',
      'groupName': 'Njangi Bonanjo',
      'kind': 'statutes_published',
      'target': '/tontines/grp_1/statuts',
      'params': <String, dynamic>{'version': 2, 'deadlineAt': '2026-11-05T17:00:00.000Z', 'onExpiry': 'exclude', 'groupName': 'Njangi Bonanjo'},
      'createdAt': '2026-10-29T10:00:00.000Z',
      'read': false,
    });
    expect(n.groupId, 'grp_1');
    expect(n.target, '/tontines/grp_1/statuts');
    expect(n.params['version'], 2);
    expect(n.title, 'Nouveaux statuts à accepter');
    // 17:00 UTC = 18:00 à Douala.
    expect(n.body, contains('Njangi Bonanjo'));
    expect(n.body, contains('05 novembre 18:00'));
    expect(notificationRoute(target: n.target, groupId: n.groupId, code: n.code), '/app/groups/grp_1/rules');
  });

  test('notifications : titres par type et étape, routes des sections', () {
    KombeNotification of(String kind, Map<String, dynamic> params, {String? target}) => TontineNotificationRepository.notification(<String, dynamic>{
          'notificationId': '1', 'groupId': 'g', 'groupName': 'Njangi', 'kind': kind, 'target': target, 'params': params,
          'createdAt': '2026-10-29T10:00:00.000Z', 'read': true,
        });
    expect(of('due_reminder', <String, dynamic>{'stage': 'j1', 'roundSeq': 3, 'date': '2026-11-02', 'deadlineTime': '18:00', 'remaining': '5000'}).title,
        'Cotisation à verser demain');
    expect(of('due_reminder', <String, dynamic>{'stage': 'late'}).title, 'Cotisation en retard');
    expect(of('due_reminder', <String, dynamic>{'stage': 'j1', 'roundSeq': 3, 'date': '2026-11-02', 'deadlineTime': '18:00'}).body,
        'Njangi · Tour 3 · avant le 02 novembre à 18:00');
    expect(of('meeting_reminder', <String, dynamic>{'stage': 'j0'}).title, 'Séance aujourd’hui');
    expect(of('role_proposed', <String, dynamic>{'role': 'treasurer'}).body, 'Njangi · Trésorier');
    expect(of('join_request', <String, dynamic>{'name': 'Awa'}).body, 'Njangi · Awa demande à rejoindre');
    expect(of('decision', const <String, dynamic>{}).title, 'Vote ouvert');
    expect(of('payout_to_confirm', const <String, dynamic>{}).title, 'Confirmez la réception de votre remise');
    expect(notificationRoute(target: '/tontines/g/membres'), '/app/groups/g/members');
    expect(notificationRoute(target: '/tontines/g/calendrier'), '/app/groups/g/cycle');
    expect(notificationRoute(target: '/tontines/g/argent'), '/app/groups/g/funds');
    expect(notificationRoute(target: '/tontines/g/seances/mt_1'), '/app/groups/g');
    expect(notificationRoute(target: '/tontines/g/decisions'), '/app/votes');
    expect(notificationRoute(target: null, groupId: 'g'), '/app/groups/g');
    expect(notificationRoute(target: '/tontines/g', code: 'statutes_excluded'), isNull);
  });

  test('invitation : code, lien et texte WhatsApp rendus (rien n’est jeté)', () async {
    final TontineGroupRepository repo = TontineGroupRepository(
      api: apiFor((_) => <String, dynamic>{
            'invitationId': 'inv_1', 'code': 'K7P2MNQX', 'url': 'https://kombe.app/#/rejoindre/K7P2MNQX',
            'whatsappText': 'Rejoins notre tontine « Njangi » sur KÓMBE', 'expiresAt': '2026-11-12T10:00:00.000Z',
            'maxUses': 30, 'usedCount': 0, 'revoked': false,
          }),
    );
    final GroupInvitation inv = ((await repo.createInvitation('grp_1')) as OperationSuccess<GroupInvitation>).value;
    expect(calls.single.url.path, '/v1/tontines/grp_1/invitations');
    expect(calls.single.method, 'POST');
    expect(jsonDecode(calls.single.body), <String, dynamic>{});
    expect((inv.code, inv.url, inv.maxUses), ('K7P2MNQX', 'https://kombe.app/#/rejoindre/K7P2MNQX', 30));
    expect(inv.whatsappText, contains('Njangi'));
  });

  test('membres : demandes en attente gardées avec fonctions et fonctions proposées', () async {
    final TontineGroupRepository repo = TontineGroupRepository(
      api: apiFor((_) => <dynamic>[
            <String, dynamic>{'membershipId': 'm1', 'displayName': 'Awa', 'state': 'active', 'roles': <String>['animator', 'member'], 'pendingRoles': <String>[], 'isMe': true},
            <String, dynamic>{'membershipId': 'm2', 'displayName': 'Paul', 'state': 'pending', 'roles': <String>[], 'pendingRoles': <String>[]},
            <String, dynamic>{'membershipId': 'm3', 'displayName': 'Ngo', 'state': 'active', 'roles': <String>['member'], 'pendingRoles': <String>['treasurer']},
          ]),
    );
    final List<GroupMember> m = ((await repo.listMembers('grp_1')) as ResourceReady<List<GroupMember>>).data;
    expect(m.map((GroupMember x) => x.state), <String>['active', 'pending', 'active']);
    expect(m[0].apiRoles, <String>['animator']);
    expect(m[0].isMe, isTrue);
    expect(m[2].pendingRoles, <String>['treasurer']);
    expect(await repo.decideAdmission(groupId: 'grp_1', membershipId: 'm2', admit: true), isA<OperationSuccess<void>>());
    expect(calls.last.url.path, '/v1/tontines/grp_1/members/m2/admission');
    expect(jsonDecode(calls.last.body), <String, dynamic>{'decision': 'admit'});
    await repo.proposeRole(groupId: 'grp_1', membershipId: 'm3', role: 'treasurer');
    expect(calls.last.url.path, '/v1/tontines/grp_1/roles');
    expect(jsonDecode(calls.last.body), <String, dynamic>{'membershipId': 'm3', 'role': 'treasurer'});
    await repo.acceptRole(groupId: 'grp_1', role: 'secretary');
    expect(calls.last.url.path, '/v1/tontines/grp_1/roles/acceptance');
    expect(jsonDecode(calls.last.body), <String, dynamic>{'role': 'secretary'});
  });

  test('statuts : lecture, acceptation par empreinte, publication et échéance', () async {
    final Map<String, dynamic> view = <String, dynamic>{
      'version': 2, 'title': 'Statuts', 'body': 'Article 1', 'hash': 'ab' * 32, 'publishedAt': '2026-10-20T10:00:00.000Z',
      'acceptedByMe': false, 'acceptedCount': 1, 'expectedCount': 3,
      'deadline': <String, dynamic>{'deadlineAt': '2026-10-27T10:00:00.000Z', 'acceptanceDays': 7, 'onExpiry': 'exclude'},
      'myDeadlineAt': '2026-10-27T10:00:00.000Z',
      'pending': <dynamic>[<String, dynamic>{'membershipId': 'm2', 'name': 'Paul', 'state': 'active', 'deadlineAt': '2026-10-27T10:00:00.000Z'}],
    };
    final TontineGroupRepository repo = TontineGroupRepository(
      api: apiFor((http.Request r) => r.url.path.endsWith('/reminders') ? <String, dynamic>{'reminded': 2} : view),
    );
    final TontineStatutes s = ((await repo.getStatutes('grp_1')) as ResourceReady<TontineStatutes?>).data!;
    expect((s.version, s.acceptedCount, s.expectedCount), (2, 1, 3));
    expect(s.deadline!.onExpiry, StatutesOnExpiry.exclude);
    expect(s.pending.single.name, 'Paul');
    await repo.acceptStatutes(groupId: 'grp_1', hash: s.hash);
    expect(calls.last.url.path, '/v1/tontines/grp_1/statutes/acceptance');
    expect(jsonDecode(calls.last.body), <String, dynamic>{'hash': 'ab' * 32});
    await repo.publishStatutes(groupId: 'grp_1', acceptanceDays: 10, onExpiry: StatutesOnExpiry.keep);
    expect(jsonDecode(calls.last.body), <String, dynamic>{'acceptanceDays': 10, 'onExpiry': 'keep'});
    await repo.extendStatutesDeadline(groupId: 'grp_1', extendDays: 5);
    expect((calls.last.method, calls.last.url.path), ('PATCH', '/v1/tontines/grp_1/statutes/deadline'));
    expect(jsonDecode(calls.last.body), <String, dynamic>{'extendDays': 5});
    expect(((await repo.remindStatutes('grp_1')) as OperationSuccess<int>).value, 2);
  });

  test('statuts absents (404) : rien à lire, pas une erreur', () async {
    final TontineGroupRepository repo = TontineGroupRepository(api: apiFor((_) => http.Response('{"code":"OBJET_INTROUVABLE"}', 404)));
    expect(((await repo.getStatutes('grp_1')) as ResourceReady<TontineStatutes?>).data, isNull);
  });

  test('démarrage par tirage : le tirage scellé est réutilisé après un refus', () async {
    int draws = 0;
    int starts = 0;
    final TontineGroupRepository repo = TontineGroupRepository(
      api: apiFor((http.Request r) {
        if (r.url.path.endsWith('/draws')) {
          draws++;
          return <String, dynamic>{'drawId': 'drw_$draws', 'commitment': 'c'};
        }
        starts++;
        if (starts == 1) return http.Response(jsonEncode(<String, dynamic>{'code': 'RULES_NOT_ACCEPTED', 'message': 'Statuts pas encore acceptés par : Paul'}), 409);
        return <String, dynamic>{'groupId': 'grp_1'};
      }),
    );
    final OperationResult<void> first = await repo.startCycle('grp_1', CycleOrderKind.draw);
    expect(outcomeMessage(first), 'Statuts pas encore acceptés par : Paul');
    expect(await repo.startCycle('grp_1', CycleOrderKind.draw), isA<OperationSuccess<void>>());
    expect(draws, 1);
    final List<Map<String, dynamic>> bodies = calls
        .where((http.Request c) => c.url.path.endsWith('/cycle'))
        .map((http.Request c) => jsonDecode(c.body) as Map<String, dynamic>)
        .toList();
    expect(bodies.map((Map<String, dynamic> b) => b['drawId']), <String>['drw_1', 'drw_1']);
  });

  test('création : caisses annexes fermées sauf montant tapé par le bureau ; nom du profil', () async {
    TontineCreation draft({int? solidarity, int? operating}) => TontineCreation(
          name: 'Njangi',
          contributionPerShare: '5000',
          cadenceKind: CadenceKind.everyNDays,
          everyNDays: 8,
          firstMeetingDate: '2026-11-02',
          deadlineTime: '18:00',
          maxMembers: 12,
          solidarityPerMeeting: solidarity,
          operatingPerMeeting: operating,
        );
    final Map<String, dynamic> off = settingsForDraft(draft());
    expect(off['cadence'], <String, dynamic>{'kind': 'every_n_days', 'n': 8});
    expect(off['solidarity'], <String, dynamic>{'enabled': false, 'perMeeting': '0', 'scale': <dynamic>[]});
    expect(off['operating'], <String, dynamic>{'enabled': false, 'perMeeting': '0'});
    final Map<String, dynamic> on = settingsForDraft(draft(solidarity: 750));
    expect(on['solidarity'], <String, dynamic>{'enabled': true, 'perMeeting': '750', 'scale': <dynamic>[]});
    expect(const TontineCreation(name: 'x', contributionPerShare: '1', cadenceKind: CadenceKind.daily, firstMeetingDate: '2026-11-02', deadlineTime: '18:00', maxMembers: 2).cadenceJson,
        <String, dynamic>{'kind': 'daily'});

    final TontineGroupRepository noName = TontineGroupRepository(api: apiFor((_) => <String, dynamic>{'displayName': null}));
    final OperationResult<String> refused = await noName.createGroup(draft());
    expect(outcomeMessage(refused), contains('Mon profil'));
    expect(calls.where((http.Request c) => c.url.path == '/v1/tontines'), isEmpty);
  });

  test('droits : bouton Inviter pour président, vice-président, secrétaire seulement', () {
    GroupSummary g(Set<String> roles) => GroupSummary(
          id: 'g', name: 'n', role: GroupRole.member, memberCount: 2, cycleIndex: 0, cycleTotal: 0,
          contributionAmountXaf: 1, nextDueAtUtc: DateTime.utc(2026), apiRoles: roles,
        );
    expect(g(<String>{'secretary'}).can(TontineAct.invite), isTrue);
    expect(g(<String>{'vice_president'}).can(TontineAct.invite), isTrue);
    expect(g(<String>{'treasurer'}).can(TontineAct.invite), isFalse);
    expect(g(<String>{'secretary'}).can(TontineAct.admit), isFalse);
    expect(g(<String>{'secretary'}).can(TontineAct.startCycle), isTrue);
  });
}
