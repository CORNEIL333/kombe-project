import 'dart:async';

import '../../core/api/api_failure.dart';
import '../../core/security/secure_session_store.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../domain/entities/auth.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/dispute.dart';
import '../../domain/entities/document.dart';
import '../../domain/entities/governance.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../../domain/entities/profile.dart';
import '../../domain/repositories/auth_repository.dart';
import '../../domain/repositories/contribution_repository.dart';
import '../../domain/repositories/dashboard_repository.dart';
import '../../domain/repositories/dispute_repository.dart';
import '../../domain/repositories/document_repository.dart';
import '../../domain/repositories/governance_repository.dart';
import '../../domain/repositories/group_repository.dart';
import '../../domain/repositories/notification_repository.dart';
import '../../domain/repositories/profile_repository.dart';
import 'kombe_api_client.dart';
import 'stored_session_codec.dart';

// ── Adaptateurs de l'application mobile vers l'API « tontine réelle »
// (docs/API_TONTINE.md, la même que la PWA). KÓMBE ne garde pas l'argent :
// chaque cotisation est la DÉCLARATION d'un paiement externe, confirmée par le
// trésorier. Les écritures portent une clé d'idempotence ; rien n'est présenté
// comme confirmé avant la réponse du serveur. Les montants sont des chaînes
// d'entiers XAF côté API, des `int` ici (bornés par le serveur à 10 chiffres).

List<Map<String, dynamic>> _items(ApiResponse res) =>
    ((res.body['items'] as List<dynamic>?) ?? const <dynamic>[]).cast<Map<String, dynamic>>();

int _xaf(Object? v) => int.tryParse('${v ?? 0}') ?? 0;

DateTime _date(Object? v) {
  final String s = '${v ?? ''}';
  if (RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(s)) {
    // Date métier (Douala) : midi local pour ne jamais changer de jour.
    return DateTime.parse('${s}T11:00:00Z');
  }
  return DateTime.tryParse(s)?.toUtc() ?? DateTime.now().toUtc();
}

Future<Resource<T>> _read<T>(Future<T> Function() run) async {
  try {
    return ResourceReady<T>(await run());
  } on ApiFailure catch (e) {
    return ResourceFailure<T>(e);
  }
}

Future<OperationResult<T>> _write<T>(Future<T> Function() run) async {
  try {
    return OperationSuccess<T>(await run());
  } on ApiFailure catch (e) {
    return OperationFailure<T>(e);
  }
}

/// Fonction la plus « haute » d'une personne, pour l'affichage mobile.
GroupRole roleFrom(List<dynamic> roles) {
  final Set<String> r = roles.map((dynamic x) => '$x').toSet();
  if (r.contains('animator') || r.contains('vice_president')) return GroupRole.administrator;
  if (r.contains('treasurer') || r.contains('treasurer_deputy')) return GroupRole.treasurer;
  if (r.contains('auditor')) return GroupRole.controller;
  if (r.contains('secretary')) return GroupRole.secretary;
  return GroupRole.member;
}

String channelOf(PaymentChannel c) => switch (c) {
  PaymentChannel.cash => 'cash',
  PaymentChannel.orangeMoney => 'orange_money',
  PaymentChannel.mtnMomo => 'mtn_momo',
  PaymentChannel.bankTransfer => 'bank',
  PaymentChannel.internationalTransfer => 'international_transfer',
  PaymentChannel.mobileMoney => 'other',
};

PaymentChannel? channelFrom(Object? v) => switch ('$v') {
  'cash' => PaymentChannel.cash,
  'orange_money' => PaymentChannel.orangeMoney,
  'mtn_momo' => PaymentChannel.mtnMomo,
  'bank' => PaymentChannel.bankTransfer,
  'international_transfer' => PaymentChannel.internationalTransfer,
  'other' => PaymentChannel.mobileMoney,
  _ => null,
};

ContributionStatus statusFrom(Object? v) => switch ('$v') {
  'declared' => ContributionStatus.submitted,
  'confirmed' => ContributionStatus.confirmed,
  'validated' => ContributionStatus.validated,
  'rejected' => ContributionStatus.rejected,
  'compensated' => ContributionStatus.compensated,
  _ => ContributionStatus.submitted,
};

// ── Connexion ────────────────────────────────────────────────────────────

/// Connexion par téléphone (+237) ou e-mail, code à 6 chiffres (ADR-0025).
/// Le premier code vérifié crée le compte : inscription, connexion et
/// récupération sont le même geste côté serveur.
final class TontineAuthRepository implements AuthRepository {
  TontineAuthRepository({required KombeApiClient api, required SecureSessionStore sessionStore})
      : _api = api,
        _sessionStore = sessionStore {
    unawaited(_hydrate());
  }

  final KombeApiClient _api;
  final SecureSessionStore _sessionStore;
  final StreamController<Resource<AuthSession?>> _updates = StreamController<Resource<AuthSession?>>.broadcast();
  Resource<AuthSession?> _current = const ResourceLoading<AuthSession?>();
  String? _lastLogin;

  void _publish(Resource<AuthSession?> next) {
    _current = next;
    _updates.add(next);
  }

  Future<void> _hydrate() async {
    final StoredSession? stored = decodeStoredSession(await _sessionStore.readOpaqueSession());
    _publish(ResourceReady<AuthSession?>(
      stored == null || stored.isExpired
          ? null
          : AuthSession(identityId: stored.identityId, accountStatus: AccountStatus.active, expiresAtUtc: stored.expiresAtUtc),
    ));
  }

  @override
  Stream<Resource<AuthSession?>> watchSession() => Stream<Resource<AuthSession?>>.multi((controller) {
        controller.add(_current);
        final StreamSubscription<Resource<AuthSession?>> sub = _updates.stream.listen(controller.add);
        controller.onCancel = sub.cancel;
      });

  Future<OperationResult<void>> _request(String login) => _write<void>(() async {
        final ApiResponse res = await _api.postOnce('/auth/code-requests', <String, dynamic>{'login': login.trim()});
        _lastLogin = (res.body['login'] as String?) ?? login.trim();
      });

  Future<OperationResult<AuthSession>> _verify(String login, String code) => _write<AuthSession>(() async {
        final ApiResponse res = await _api.postOnce(
          '/auth/code-verifications',
          <String, dynamic>{'login': _lastLogin ?? login.trim(), 'code': code.trim()},
        );
        final Object? sessionId = res.body['sessionId'];
        final Object? expiresAt = res.body['expiresAt'];
        final Object? identityId = res.body['identityId'];
        if (sessionId is! String || expiresAt is! int || identityId is! String) {
          throw ApiFailure(statusCode: res.statusCode, code: 'RESPONSE_NOT_JSON');
        }
        final DateTime expiresAtUtc = DateTime.fromMillisecondsSinceEpoch(expiresAt, isUtc: true);
        await _sessionStore.writeOpaqueSession(
          encodeStoredSession(StoredSession(sessionId: sessionId, identityId: identityId, expiresAtUtc: expiresAtUtc)),
        );
        final AuthSession session = AuthSession(identityId: identityId, accountStatus: AccountStatus.active, expiresAtUtc: expiresAtUtc);
        _publish(ResourceReady<AuthSession?>(session));
        return session;
      });

  @override
  Future<OperationResult<void>> requestRegistration(String identityId) => _request(identityId);

  @override
  Future<OperationResult<AccountStatus>> verifyRegistration({required String identityId, required String code}) async {
    final OperationResult<AuthSession> r = await _verify(identityId, code);
    return switch (r) {
      OperationSuccess<AuthSession>() => const OperationSuccess<AccountStatus>(AccountStatus.active),
      OperationFailure<AuthSession>(:final Object error) => OperationFailure<AccountStatus>(error),
      OperationBlocked<AuthSession>(:final String reason) => OperationBlocked<AccountStatus>(reason),
    };
  }

  @override
  Future<OperationResult<void>> requestLogin(String identityId) => _request(identityId);

  @override
  Future<OperationResult<AuthSession>> completeLogin({required String identityId, required String code}) => _verify(identityId, code);

  @override
  Future<OperationResult<void>> requestRecovery(String identityId) => _request(identityId);

  @override
  Future<OperationResult<void>> completeRecovery({required String identityId, required String code}) async {
    final OperationResult<AuthSession> r = await _verify(identityId, code);
    return switch (r) {
      OperationSuccess<AuthSession>() => const OperationSuccess<void>(null),
      OperationFailure<AuthSession>(:final Object error) => OperationFailure<void>(error),
      OperationBlocked<AuthSession>(:final String reason) => OperationBlocked<void>(reason),
    };
  }

  @override
  Future<OperationResult<void>> signOut() async {
    try {
      await _api.post('/auth/logout', const <String, dynamic>{});
    } on ApiFailure {
      // Session déjà invalide côté serveur : on efface quand même l'appareil.
    }
    await _sessionStore.clear();
    _publish(const ResourceReady<AuthSession?>(null));
    return const OperationSuccess<void>(null);
  }
}

// ── Profil ───────────────────────────────────────────────────────────────

final class TontineProfileRepository implements ProfileRepository {
  const TontineProfileRepository({required KombeApiClient api}) : _api = api;
  final KombeApiClient _api;

  static UserProfile _profile(Map<String, dynamic> b) {
    final String login = '${b['login'] ?? ''}';
    return UserProfile(
      identityId: '${b['identityId'] ?? login}',
      displayName: '${b['displayName'] ?? ''}',
      phoneE164: login.startsWith('+') ? login : '',
      localeCode: '${b['language'] ?? 'fr'}' == 'en' ? 'en' : 'fr',
    );
  }

  @override
  Future<Resource<UserProfile>> loadProfile() => _read(() async => _profile((await _api.get('/me')).body));

  @override
  Future<OperationResult<UserProfile>> updateProfile({required String displayName, required String localeCode}) =>
      _write(() async => _profile((await _api.patch('/me', <String, dynamic>{
            if (displayName.trim().isNotEmpty) 'displayName': displayName.trim(),
            'language': localeCode == 'en' ? 'en' : 'fr',
          })).body));

  @override
  Future<OperationResult<void>> changePin({required String currentPin, required String newPin}) async =>
      const OperationBlocked<void>('Pas de code secret à changer : chaque connexion se fait par un code à usage unique.');
}

// ── Groupes ──────────────────────────────────────────────────────────────

final class TontineGroupRepository implements GroupRepository {
  const TontineGroupRepository({required KombeApiClient api}) : _api = api;
  final KombeApiClient _api;

  String _t(String id) => '/tontines/${Uri.encodeComponent(id)}';

  Future<List<Map<String, dynamic>>> _mine() async => _items(await _api.get('/me/tontines'));

  static GroupSummary _summary(Map<String, dynamic> g, {int cycleIndex = 0, int cycleTotal = 0}) => GroupSummary(
        id: '${g['groupId']}',
        name: '${g['name']}',
        role: roleFrom((g['roles'] as List<dynamic>?) ?? const <dynamic>[]),
        memberCount: (g['memberCount'] as num?)?.toInt() ?? 0,
        cycleIndex: cycleIndex,
        cycleTotal: cycleTotal,
        contributionAmountXaf: _xaf(g['contributionPerShare']),
        nextDueAtUtc: _date(g['nextMeetingDate']),
      );

  @override
  Future<Resource<List<GroupSummary>>> listGroups() => _read(() async =>
      (await _mine()).where((Map<String, dynamic> g) => g['membershipState'] == 'active').map(_summary).toList());

  @override
  Future<Resource<List<MemberGroup>>> listMyGroups() => _read(() async => (await _mine())
      .map((Map<String, dynamic> g) => MemberGroup(
            groupId: '${g['groupId']}',
            displayName: '${g['name']}',
            tontineModel: 'personnalise',
            rotationType: 'rotative_fermee',
            groupState: '${g['state']}',
            membershipState: '${g['membershipState']}',
          ))
      .toList());

  @override
  Future<Resource<GroupDetails>> getGroup(String groupId) => _read(() async {
        final Map<String, dynamic> d = (await _api.get(_t(groupId))).body;
        final Map<String, dynamic> me = (d['me'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
        final Map<String, dynamic> settings = (d['settings'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
        final Map<String, dynamic>? round = d['currentRound'] as Map<String, dynamic>?;
        final Map<String, dynamic>? next = d['nextMeeting'] as Map<String, dynamic>?;
        final Map<String, dynamic>? statutes = d['statutes'] as Map<String, dynamic>?;
        final List<dynamic> funds = (d['funds'] as List<dynamic>?) ?? const <dynamic>[];
        final String caisses = funds
            .cast<Map<String, dynamic>>()
            .map((Map<String, dynamic> f) => '${f['name']} : ${f['confirmedBalance']} FCFA confirmés')
            .join(' · ');
        return GroupDetails(
          summary: _summary(<String, dynamic>{
            'groupId': d['groupId'],
            'name': d['name'],
            'roles': me['roles'],
            'memberCount': d['memberCount'],
            'contributionPerShare': settings['contributionPerShare'],
            'nextMeetingDate': next?['date'] ?? round?['date'],
          }, cycleIndex: (round?['seq'] as num?)?.toInt() ?? 0, cycleTotal: (d['memberCount'] as num?)?.toInt() ?? 0),
          description: 'Argent tenu par le trésorier, pas par KÓMBE. $caisses',
          currentRulesVersion: (statutes?['version'] as num?)?.toInt() ?? 0,
        );
      });

  static GroupMember _member(Map<String, dynamic> m) => GroupMember(
        identityId: '${m['membershipId']}',
        displayName: '${m['displayName']}',
        role: roleFrom((m['roles'] as List<dynamic>?) ?? const <dynamic>[]),
        joinedAtUtc: _date(m['joinedAt']),
      );

  @override
  Future<Resource<List<GroupMember>>> listMembers(String groupId) => _read(() async =>
      _items(await _api.get('${_t(groupId)}/members')).where((Map<String, dynamic> m) => m['state'] == 'active').map(_member).toList());

  @override
  Future<Resource<GroupMember>> getMember(String groupId, String identityId) => _read(() async {
        final Map<String, dynamic> m = _items(await _api.get('${_t(groupId)}/members')).firstWhere(
              (Map<String, dynamic> x) => x['membershipId'] == identityId,
              orElse: () => throw const ApiFailure(statusCode: 404, code: 'OBJET_INTROUVABLE'),
            );
        return _member(m);
      });

  @override
  Future<Resource<CycleDetails>> getCycle(String groupId) async {
    try {
      final List<Map<String, dynamic>> rounds = _items(await _api.get('${_t(groupId)}/rounds'));
      if (rounds.isEmpty) return const ResourceUnavailable<CycleDetails>();
      final int current =
          (rounds.firstWhere((Map<String, dynamic> r) => r['state'] == 'open', orElse: () => rounds.last)['seq'] as num).toInt();
      return ResourceReady<CycleDetails>(CycleDetails(
        id: groupId,
        groupId: groupId,
        currentTurn: current,
        totalTurns: rounds.length,
        beneficiaries: rounds
            .map((Map<String, dynamic> r) => BeneficiaryTurn(
                  turnNumber: (r['seq'] as num).toInt(),
                  identityId: '${r['beneficiaryMembershipId'] ?? ''}',
                  displayName: '${r['beneficiaryName'] ?? '—'}',
                  dueAtUtc: _date(r['date']),
                  status: r['state'] == 'closed' || r['payoutState'] == 'received'
                      ? BeneficiaryStatus.received
                      : (r['seq'] as num).toInt() == current
                          ? BeneficiaryStatus.current
                          : BeneficiaryStatus.upcoming,
                ))
            .toList(),
      ));
    } on ApiFailure catch (e) {
      return ResourceFailure<CycleDetails>(e);
    }
  }

  @override
  Future<Resource<List<String>>> getRules(String groupId) async {
    try {
      final Map<String, dynamic> st = (await _api.get('${_t(groupId)}/statutes')).body;
      return ResourceReady<List<String>>(
        '${st['body'] ?? ''}'.split('\n').map((String l) => l.trim()).where((String l) => l.isNotEmpty).toList(),
      );
    } on ApiFailure catch (e) {
      if (e.statusCode == 404) return const ResourceReady<List<String>>(<String>[]);
      return ResourceFailure<List<String>>(e);
    }
  }

  @override
  Future<OperationResult<void>> joinGroup(String invitationCode) => _write<void>(() async {
        final String code = invitationCode.replaceAll(RegExp(r'[^A-Za-z0-9]'), '').toUpperCase();
        final Map<String, dynamic> preview = (await _api.get('/invitations/${Uri.encodeComponent(code)}')).body;
        if (preview['alreadyMember'] == true) return;
        if (preview['usable'] != true) throw const ApiFailure(statusCode: 409, code: 'STATE_CONFLICT', message: 'Ce code n’est plus valable');
        final String name = '${(await _api.get('/me')).body['displayName'] ?? ''}'.trim();
        await _api.postOnce('/invitations/${Uri.encodeComponent(code)}/join', <String, dynamic>{
          'displayName': name.isEmpty ? 'Membre' : name,
        });
      });

  /// Le bureau crée un lien d'invitation (partagé ensuite par WhatsApp) ; le
  /// numéro saisi n'est pas transmis : la personne rejoint avec le code.
  @override
  Future<OperationResult<void>> inviteMember({required String groupId, required String phoneE164}) =>
      _write<void>(() async {
        await _api.postOnce('${_t(groupId)}/invitations', <String, dynamic>{'maxUses': 1, 'days': 14});
      });

  @override
  Future<OperationResult<String>> createGroup({
    required String groupId,
    required String displayName,
    required String tontineModel,
    required String rotationType,
    String? parentGroupId,
  }) =>
      _write<String>(() async {
        final String founder = '${(await _api.get('/me')).body['displayName'] ?? ''}'.trim();
        final String today = DateTime.now().toUtc().add(const Duration(hours: 1)).toIso8601String().substring(0, 10);
        final Map<String, dynamic> created = (await _api.postOnce('/tontines', <String, dynamic>{
          'name': displayName.trim(),
          'founderDisplayName': founder.isEmpty ? 'Président' : founder,
          'settings': defaultTontineSettings(today),
        }))
            .body;
        return '${created['groupId']}';
      });

  /// Les groupes ne sont pas publiés dans un annuaire : on rejoint par invitation.
  @override
  Future<Resource<List<DiscoverableGroup>>> listDiscoverable() async => const ResourceReady<List<DiscoverableGroup>>(<DiscoverableGroup>[]);

  @override
  Future<OperationResult<void>> requestSponsorship({
    required String groupId,
    required String sponsorshipId,
    required String candidateId,
    required String sponsorId,
  }) async =>
      const OperationBlocked<void>('On rejoint un groupe avec le code d’invitation envoyé par son bureau.');
}

/// Règlement par défaut (mêmes valeurs que l'assistant de la PWA et le serveur).
Map<String, dynamic> defaultTontineSettings(String today) => <String, dynamic>{
      'contributionPerShare': '10000',
      'cadence': <String, dynamic>{'kind': 'weekly', 'weekday': 0},
      'firstMeetingDate': today,
      'deadlineTime': '18:00',
      'meetingPlace': null,
      'maxMembers': 12,
      'transparency': 'all_members',
      'feeBearer': 'member',
      'payoutPolicy': 'full_with_advance',
      'newcomersLast': true,
      'guarantorRequired': false,
      'payoutWitnesses': 2,
      'fines': <String, dynamic>{
        'lateContributionFixed': '0',
        'lateContributionPerDay': '0',
        'lateContributionCap': '0',
        'meetingLate': '0',
        'meetingAbsence': '0',
        'indisciplineCap': '0',
        'graceDays': 2,
      },
      'solidarity': <String, dynamic>{'enabled': true, 'perMeeting': '1000', 'scale': <dynamic>[]},
      'operating': <String, dynamic>{'enabled': true, 'perMeeting': '500'},
      'yearEndReserve': <String, dynamic>{'enabled': false, 'perMeeting': '0'},
    };

// ── Cotisations ──────────────────────────────────────────────────────────

final class TontineContributionRepository implements ContributionRepository {
  const TontineContributionRepository({required KombeApiClient api}) : _api = api;
  final KombeApiClient _api;

  static Contribution _contribution(String groupId, Map<String, dynamic> m) => Contribution(
        id: '${m['movementId']}',
        groupId: groupId,
        obligationId: '${m['fundId']}',
        amountXaf: _xaf(m['amount']),
        status: statusFrom(m['state']),
        channel: channelFrom(m['channel']),
        declaredAtUtc: _date(m['declaredAt']),
        note: m['reference'] as String?,
      );

  Future<List<String>> _groups(String? groupId) async => groupId != null
      ? <String>[groupId]
      : _items(await _api.get('/me/tontines'))
          .where((Map<String, dynamic> g) => g['membershipState'] == 'active')
          .map((Map<String, dynamic> g) => '${g['groupId']}')
          .toList();

  @override
  Future<Resource<List<Contribution>>> listHistory({String? groupId}) => _read(() async {
        final List<Contribution> out = <Contribution>[];
        for (final String gid in await _groups(groupId)) {
          final ApiResponse res = await _api.get('/tontines/${Uri.encodeComponent(gid)}/movements?mine=1');
          out.addAll(_items(res).where((Map<String, dynamic> m) => m['kind'] == 'contribution').map((Map<String, dynamic> m) => _contribution(gid, m)));
        }
        out.sort((Contribution a, Contribution b) => (b.declaredAtUtc ?? DateTime(0)).compareTo(a.declaredAtUtc ?? DateTime(0)));
        return out;
      });

  @override
  Future<Resource<Contribution>> getContribution(String contributionId) async {
    final Resource<List<Contribution>> all = await listHistory();
    return switch (all) {
      ResourceReady<List<Contribution>>(:final List<Contribution> data) =>
        data.where((Contribution c) => c.id == contributionId).map((Contribution c) => ResourceReady<Contribution>(c)).firstOrNull ??
            ResourceFailure<Contribution>(const ApiFailure(statusCode: 404, code: 'OBJET_INTROUVABLE')),
      ResourceFailure<List<Contribution>>(:final Object error) => ResourceFailure<Contribution>(error),
      _ => const ResourceUnavailable<Contribution>(),
    };
  }

  /// Le brouillon porte un montant pour un groupe : il est réparti sur les
  /// échéances ouvertes du plus ancien tour (cagnotte d'abord, puis secours,
  /// fonctionnement…), une déclaration par caisse — comme on paie en séance.
  /// La note sert de référence de transaction (exigée pour le Mobile Money).
  @override
  Future<OperationResult<Contribution>> submitDraft(ContributionDraft draft) => _write<Contribution>(() async {
        final List<Map<String, dynamic>> dues = _items(await _api.get('/me/dues?groupId=${Uri.encodeQueryComponent(draft.groupId)}'))
            .where((Map<String, dynamic> d) => _xaf(d['remaining']) > 0)
            .toList()
          ..sort((Map<String, dynamic> a, Map<String, dynamic> b) {
            final int byRound = (a['roundSeq'] as num).compareTo(b['roundSeq'] as num);
            if (byRound != 0) return byRound;
            return (a['fundKind'] == 'rotation' ? 0 : 1).compareTo(b['fundKind'] == 'rotation' ? 0 : 1);
          });
        if (dues.isEmpty) {
          throw const ApiFailure(statusCode: 409, code: 'STATE_CONFLICT', message: 'Rien à régler pour ce groupe pour le moment');
        }
        int left = draft.amountXaf;
        final String? reference = (draft.note ?? '').trim().isEmpty ? null : draft.note!.trim();
        Contribution? first;
        for (final Map<String, dynamic> d in dues) {
          if (left <= 0) break;
          final int part = left < _xaf(d['remaining']) ? left : _xaf(d['remaining']);
          final Map<String, dynamic> mv = (await _api.postOnce('/tontines/${Uri.encodeComponent(draft.groupId)}/movements', <String, dynamic>{
            'fundId': d['fundId'],
            'kind': 'contribution',
            'amount': '$part',
            'roundSeq': d['roundSeq'],
            'channel': channelOf(draft.channel),
            if (reference != null) 'reference': reference.length > 64 ? reference.substring(0, 64) : reference,
          }))
              .body;
          first ??= _contribution(draft.groupId, mv);
          left -= part;
        }
        if (left > 0) {
          // Déclarations faites pour ce qui était dû ; l'excédent n'est pas déclaré.
          return first!;
        }
        return first!;
      });
}

// ── Validation (trésorier, commissaire aux comptes) ──────────────────────

final class TontineGovernanceRepository implements GovernanceRepository {
  TontineGovernanceRepository({required KombeApiClient api}) : _api = api;
  final KombeApiClient _api;
  final Map<String, ({String groupId, bool control})> _known = <String, ({String groupId, bool control})>{};

  ValidationItem _item(String groupId, Map<String, dynamic> m) => ValidationItem(
        contributionId: '${m['movementId']}',
        groupId: groupId,
        memberIdentityId: '${m['membershipId'] ?? ''}',
        memberDisplayName: '${m['memberName'] ?? '—'}',
        amountXaf: _xaf(m['amount']),
        declaredAtUtc: _date(m['declaredAt']),
        version: 1,
        evidenceName: m['reference'] as String?,
      );

  @override
  Future<Resource<List<ValidationItem>>> listPendingValidations() => _read(() async {
        final List<ValidationItem> out = <ValidationItem>[];
        for (final Map<String, dynamic> g in _items(await _api.get('/me/tontines'))) {
          if (g['membershipState'] != 'active') continue;
          final Set<String> roles = ((g['roles'] as List<dynamic>?) ?? const <dynamic>[]).map((dynamic r) => '$r').toSet();
          final bool confirms = roles.intersection(<String>{'treasurer', 'treasurer_deputy', 'animator', 'vice_president'}).isNotEmpty;
          final bool controls = roles.contains('auditor');
          if (!confirms && !controls) continue;
          final String gid = '${g['groupId']}';
          for (final (String state, bool control) in <(String, bool)>[if (confirms) ('declared', false), if (controls) ('confirmed', true)]) {
            for (final Map<String, dynamic> m in _items(await _api.get('/tontines/${Uri.encodeComponent(gid)}/movements?state=$state'))) {
              final Map<String, dynamic> can = (m['can'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
              if (can[control ? 'control' : 'confirm'] != true) continue;
              _known['${m['movementId']}'] = (groupId: gid, control: control);
              out.add(_item(gid, m));
            }
          }
        }
        return out;
      });

  @override
  Future<Resource<ValidationItem>> getValidation(String contributionId) async {
    if (!_known.containsKey(contributionId)) await listPendingValidations();
    final Resource<List<ValidationItem>> all = await listPendingValidations();
    return switch (all) {
      ResourceReady<List<ValidationItem>>(:final List<ValidationItem> data) =>
        data.where((ValidationItem v) => v.contributionId == contributionId).map((ValidationItem v) => ResourceReady<ValidationItem>(v)).firstOrNull ??
            ResourceFailure<ValidationItem>(const ApiFailure(statusCode: 404, code: 'OBJET_INTROUVABLE')),
      ResourceFailure<List<ValidationItem>>(:final Object error) => ResourceFailure<ValidationItem>(error),
      _ => const ResourceUnavailable<ValidationItem>(),
    };
  }

  @override
  Future<OperationResult<void>> decideValidation({
    required String contributionId,
    required int expectedVersion,
    required ValidationDecision decision,
  }) async {
    if (!_known.containsKey(contributionId)) await listPendingValidations();
    final ({String groupId, bool control})? k = _known[contributionId];
    if (k == null) return OperationFailure<void>(const ApiFailure(statusCode: 404, code: 'OBJET_INTROUVABLE'));
    final String base = '/tontines/${Uri.encodeComponent(k.groupId)}/movements';
    return _write<void>(() async {
      switch (decision) {
        case ValidationDecision.validate:
          if (k.control) {
            await _api.postOnce('$base/${Uri.encodeComponent(contributionId)}/control', const <String, dynamic>{});
          } else {
            await _api.postOnce('$base/confirmations', <String, dynamic>{'movementIds': <String>[contributionId]});
          }
        case ValidationDecision.reject:
          await _api.postOnce('$base/${Uri.encodeComponent(contributionId)}/rejection', <String, dynamic>{
            'reason': 'Paiement non retrouvé par la trésorerie (rejet depuis l’application mobile)',
          });
        case ValidationDecision.requestInformation:
          throw const ApiFailure(statusCode: 422, code: 'VALIDATION', message: 'Demandez la précision en séance ou par WhatsApp, puis confirmez ou rejetez.');
      }
      _known.remove(contributionId);
    });
  }

  // ── Votes de l'assemblée (ADR-0038) ────────────────────────────────────
  // Pause des séances, destitution, exclusion, suspension du droit de bouffer,
  // reprise de place : majorité absolue des électeurs, vote secret.

  final Map<String, String> _voteGroup = <String, String>{};

  static const Map<String, String> _kindTitles = <String, String>{
    'pause': 'Pause des séances',
    'removal': 'Destitution',
    'exclusion': 'Exclusion',
    'payout_suspension': 'Suspension du droit de bouffer',
    'replacement': 'Reprise de place',
  };

  VoteSummary _vote(String gid, Map<String, dynamic> d) {
    final String kind = '${d['kind']}';
    final String? target = d['targetName'] as String?;
    final Map<String, dynamic> params = (d['params'] as Map<String, dynamic>?) ?? const <String, dynamic>{};
    final String what = switch (kind) {
      'pause' => '${params['occurrences'] ?? 1} séance(s)',
      'replacement' => '${params['incomingName'] ?? ''} ← ${target ?? ''}',
      _ => target ?? '',
    };
    _voteGroup['${d['decisionId']}'] = gid;
    return VoteSummary(
      id: '${d['decisionId']}',
      groupId: gid,
      title: '${_kindTitles[kind] ?? kind} · $what',
      opensAtUtc: _date(d['openedAt']),
      closesAtUtc: _date(d['closesAt']),
      hasCurrentUserVoted: d['myChoice'] != null,
    );
  }

  Future<List<(String, Map<String, dynamic>)>> _openDecisions() async {
    final List<(String, Map<String, dynamic>)> out = <(String, Map<String, dynamic>)>[];
    for (final Map<String, dynamic> g in _items(await _api.get('/me/tontines'))) {
      if (g['membershipState'] != 'active') continue;
      final String gid = '${g['groupId']}';
      for (final Map<String, dynamic> d in _items(await _api.get('/tontines/${Uri.encodeComponent(gid)}/decisions'))) {
        if (d['state'] == 'open') out.add((gid, d));
      }
    }
    return out;
  }

  @override
  Future<Resource<List<VoteSummary>>> listVotes() => _read(() async => <VoteSummary>[
        for (final (String gid, Map<String, dynamic> d) in await _openDecisions()) _vote(gid, d),
      ]);

  @override
  Future<Resource<VoteDetails>> getVote(String voteId) => _read(() async {
        for (final (String gid, Map<String, dynamic> d) in await _openDecisions()) {
          if ('${d['decisionId']}' != voteId) continue;
          final int electorate = (d['electorate'] as num?)?.toInt() ?? 0;
          final String outcome = (d['can'] as Map<String, dynamic>?)?['vote'] == true ? '' : '\nVous ne votez pas sur ce scrutin.';
          return VoteDetails(
            summary: _vote(gid, d),
            description: '${d['reason'] ?? ''}$outcome',
            electorate: electorate,
            requiredYes: electorate ~/ 2 + 1,
            ballots: (d['ballots'] as num?)?.toInt() ?? 0,
          );
        }
        throw const ApiFailure(statusCode: 404, code: 'OBJET_INTROUVABLE');
      });

  @override
  Future<OperationResult<void>> castVote({required String voteId, required VoteChoice choice}) async {
    if (!_voteGroup.containsKey(voteId)) await listVotes();
    final String? gid = _voteGroup[voteId];
    if (gid == null) return OperationFailure<void>(const ApiFailure(statusCode: 404, code: 'OBJET_INTROUVABLE'));
    final String c = switch (choice) {
      VoteChoice.forChoice => 'yes',
      VoteChoice.against => 'no',
      VoteChoice.abstain => 'abstain',
    };
    return _write<void>(() async {
      await _api.postOnce('/tontines/${Uri.encodeComponent(gid)}/decisions/${Uri.encodeComponent(voteId)}/ballots', <String, dynamic>{'choice': c});
    });
  }
}

// ── Notifications ────────────────────────────────────────────────────────

final class TontineNotificationRepository implements NotificationRepository {
  const TontineNotificationRepository({required KombeApiClient api}) : _api = api;
  final KombeApiClient _api;

  static ({NotificationKind kind, String title}) _label(String k) => switch (k) {
        'due_reminder' => (kind: NotificationKind.contribution, title: 'Une cotisation arrive à échéance'),
        'meeting_reminder' => (kind: NotificationKind.meeting, title: 'Rappel : séance demain'),
        'validation_waiting' => (kind: NotificationKind.validation, title: 'Des paiements attendent votre contrôle'),
        'payout_recorded' => (kind: NotificationKind.contribution, title: 'Remise déclarée : confirmez la réception'),
        'fine_issued' => (kind: NotificationKind.dispute, title: 'Une amende vous a été notifiée'),
        'aid_decided' => (kind: NotificationKind.system, title: 'Décision sur une demande de secours'),
        'order_change' => (kind: NotificationKind.vote, title: 'Demande d’échange de tour'),
        'membership' => (kind: NotificationKind.system, title: 'Nouvelle demande d’adhésion'),
        'minutes_ready' => (kind: NotificationKind.meeting, title: 'Procès-verbal disponible'),
        'decision' => (kind: NotificationKind.vote, title: 'Un vote de l’association vous concerne'),
        _ => (kind: NotificationKind.system, title: 'Information du groupe'),
      };

  static KombeNotification notification(Map<String, dynamic> n) {
    final ({NotificationKind kind, String title}) l = _label('${n['kind']}');
    return KombeNotification(
      id: '${n['notificationId']}',
      kind: l.kind,
      title: l.title,
      body: '${n['groupName'] ?? ''}',
      createdAtUtc: _date(n['createdAt']),
      read: n['read'] == true,
    );
  }

  @override
  Future<Resource<List<KombeNotification>>> listNotifications() =>
      _read(() async => _items(await _api.get('/me/notifications')).map(notification).toList());

  @override
  Future<OperationResult<void>> markRead(String notificationId) => _write<void>(() async {
        await _api.post('/me/notifications/read', <String, dynamic>{'ids': <String>[notificationId]});
      });
}

// ── Documents (statuts) ──────────────────────────────────────────────────

final class TontineDocumentRepository implements DocumentRepository {
  const TontineDocumentRepository({required KombeApiClient api, required Uri webBase}) : _api = api, _webBase = webBase;
  final KombeApiClient _api;
  final Uri _webBase;

  @override
  Future<Resource<List<KombeDocument>>> listDocuments() => _read(() async {
        final List<KombeDocument> out = <KombeDocument>[];
        for (final Map<String, dynamic> g in _items(await _api.get('/me/tontines'))) {
          if (g['membershipState'] != 'active') continue;
          final String gid = '${g['groupId']}';
          try {
            final Map<String, dynamic> st = (await _api.get('/tontines/${Uri.encodeComponent(gid)}/statutes')).body;
            out.add(KombeDocument(
              id: '$gid-statuts-${st['version']}',
              kind: DocumentKind.rules,
              title: 'Statuts — ${g['name']} (version ${st['version']})',
              createdAtUtc: _date(st['publishedAt']),
              downloadUri: _webBase.replace(fragment: '/groupe/$gid'),
            ));
          } on ApiFailure catch (e) {
            if (e.statusCode != 404) rethrow;
          }
        }
        return out;
      });

  @override
  Future<Resource<List<KombeDocument>>> listExports() async => const ResourceReady<List<KombeDocument>>(<KombeDocument>[]);
}

// ── Tableau de bord ──────────────────────────────────────────────────────

final class TontineDashboardRepository implements DashboardRepository {
  const TontineDashboardRepository({required KombeApiClient api}) : _api = api;
  final KombeApiClient _api;

  @override
  Future<Resource<DashboardData>> loadDashboard() => _read(() async {
        final List<Map<String, dynamic>> mine =
            _items(await _api.get('/me/tontines')).where((Map<String, dynamic> g) => g['membershipState'] == 'active').toList();
        final Map<String, dynamic>? primary = mine.isEmpty ? null : mine.first;
        DateTime? next;
        int progress = 0;
        int monthDeclared = 0;
        if (primary != null) {
          final String gid = '${primary['groupId']}';
          final List<Map<String, dynamic>> dues = _items(await _api.get('/me/dues?groupId=${Uri.encodeQueryComponent(gid)}'));
          if (dues.isNotEmpty) {
            next = dues.map((Map<String, dynamic> d) => _date(d['date'])).reduce((DateTime a, DateTime b) => a.isBefore(b) ? a : b);
            final int due = dues.fold<int>(0, (int s, Map<String, dynamic> d) => s + _xaf(d['due']));
            final int left = dues.fold<int>(0, (int s, Map<String, dynamic> d) => s + _xaf(d['remaining']));
            progress = due == 0 ? 100 : (((due - left) * 100) ~/ due).clamp(0, 100);
          } else {
            progress = 100;
          }
          final DateTime now = DateTime.now().toUtc();
          for (final Map<String, dynamic> m in _items(await _api.get('/tontines/${Uri.encodeComponent(gid)}/movements?mine=1'))) {
            final DateTime at = _date(m['declaredAt']);
            if (m['kind'] == 'contribution' && m['state'] != 'rejected' && at.year == now.year && at.month == now.month) {
              monthDeclared += _xaf(m['amount']);
            }
          }
        }
        final List<KombeNotification> recent =
            _items(await _api.get('/me/notifications')).take(5).map(TontineNotificationRepository.notification).toList();
        return DashboardData(
          primaryGroup: primary == null
              ? null
              : GroupSummary(
                  id: '${primary['groupId']}',
                  name: '${primary['name']}',
                  role: roleFrom((primary['roles'] as List<dynamic>?) ?? const <dynamic>[]),
                  memberCount: (primary['memberCount'] as num?)?.toInt() ?? 0,
                  cycleIndex: 0,
                  cycleTotal: (primary['memberCount'] as num?)?.toInt() ?? 0,
                  contributionAmountXaf: _xaf(primary['contributionPerShare']),
                  nextDueAtUtc: next ?? _date(primary['nextMeetingDate']),
                ),
          nextContributionAtUtc: next,
          currentMonthDeclaredXaf: monthDeclared,
          progressPercent: progress,
          recentActivity: recent,
        );
      });
}

// ── Litiges ──────────────────────────────────────────────────────────────

/// Les désaccords passent par la contestation d'une amende ou le commissaire
/// aux comptes (registre consultable) ; il n'existe pas de dossier de litige
/// séparé dans l'API tontine. Les écrans le disent au lieu d'inventer.
final class TontineDisputeRepository implements DisputeRepository {
  const TontineDisputeRepository();

  @override
  Future<Resource<List<DisputeSummary>>> listDisputes() async => const ResourceReady<List<DisputeSummary>>(<DisputeSummary>[]);

  @override
  Future<Resource<DisputeDetails>> getDispute(String disputeId) async => const ResourceUnavailable<DisputeDetails>();

  @override
  Future<OperationResult<DisputeSummary>> openDispute({
    required String groupId,
    required String subject,
    required String description,
    String? relatedOperationId,
  }) async =>
      const OperationBlocked<DisputeSummary>('Contestez une amende depuis l’application web, ou saisissez le commissaire aux comptes en séance.');
}
