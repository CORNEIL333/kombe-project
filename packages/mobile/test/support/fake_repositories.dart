// Dépôts FACTICES pour les tests visuels (golden, visite d'écrans).
// Vivent dans test/ : jamais embarqués dans l'application.
import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:kombe_mobile/app/di/app_dependencies.dart';
import 'package:kombe_mobile/core/security/biometric_service.dart';
import 'package:kombe_mobile/core/security/secure_session_store.dart';
import 'package:kombe_mobile/data/local/contribution_draft_database.dart';
import 'package:kombe_mobile/data/local/preferences_repository_impl.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:kombe_mobile/core/api/api_failure.dart';
import 'package:kombe_mobile/core/state/operation_result.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/domain/entities/auth.dart';
import 'package:kombe_mobile/domain/entities/contribution.dart';
import 'package:kombe_mobile/domain/entities/cycle.dart';
import 'package:kombe_mobile/domain/entities/dashboard.dart';
import 'package:kombe_mobile/domain/entities/document.dart';
import 'package:kombe_mobile/domain/entities/fine.dart';
import 'package:kombe_mobile/domain/entities/governance.dart';
import 'package:kombe_mobile/domain/entities/group.dart';
import 'package:kombe_mobile/domain/entities/notification.dart';
import 'package:kombe_mobile/domain/entities/profile.dart';
import 'package:kombe_mobile/domain/repositories/auth_repository.dart';
import 'package:kombe_mobile/domain/repositories/contribution_repository.dart';
import 'package:kombe_mobile/domain/repositories/dashboard_repository.dart';
import 'package:kombe_mobile/domain/repositories/document_repository.dart';
import 'package:kombe_mobile/domain/repositories/fine_repository.dart';
import 'package:kombe_mobile/domain/repositories/governance_repository.dart';
import 'package:kombe_mobile/domain/repositories/group_repository.dart';
import 'package:kombe_mobile/domain/repositories/notification_repository.dart';
import 'package:kombe_mobile/domain/repositories/profile_repository.dart';

/// Latence simulée : assez pour voir les états de chargement, jamais bloquante.
Future<void> _lag([int ms = 380]) => Future<void>.delayed(Duration(milliseconds: ms));

/// État partagé du bac à sable : les actions d'un écran se voient dans les autres.
final class FakeWorld {
  FakeWorld() {
    final DateTime now = DateTime.now().toUtc();
    final DateTime cycleStart = DateTime.utc(now.year, now.month, 15).subtract(const Duration(days: 92));
    turns = <BeneficiaryTurn>[
      for (int i = 0; i < _names.length; i++)
        BeneficiaryTurn(
          turnNumber: i + 1,
          identityId: 'essai-membre-${i + 1}',
          displayName: _names[i],
          dueAtUtc: DateTime.utc(cycleStart.year, cycleStart.month + i, 25),
          status: i < 3 ? BeneficiaryStatus.received : i == 3 ? BeneficiaryStatus.current : BeneficiaryStatus.upcoming,
        ),
    ];
    members = <GroupMember>[
      for (int i = 0; i < _names.length; i++)
        GroupMember(
          identityId: 'essai-membre-${i + 1}',
          displayName: _names[i],
          role: i == 1 ? GroupRole.treasurer : i == 6 ? GroupRole.controller : i == 9 ? GroupRole.secretary : GroupRole.member,
          joinedAtUtc: now.subtract(Duration(days: 300 - i * 9)),
        ),
    ];
    nextDue = DateTime.utc(now.year, now.month, now.day).add(const Duration(days: 6));
    groups = <GroupSummary>[
      GroupSummary(id: 'essai-etoiles', name: 'Les Étoiles de Yaoundé', role: GroupRole.member, memberCount: 12, cycleIndex: 4, cycleTotal: 12, contributionAmountXaf: 25000, nextDueAtUtc: nextDue),
      GroupSummary(id: 'essai-bamileke', name: 'Solidarité Bamiléké', role: GroupRole.treasurer, memberCount: 10, cycleIndex: 2, cycleTotal: 10, contributionAmountXaf: 15000, nextDueAtUtc: nextDue.add(const Duration(days: 5))),
      GroupSummary(id: 'essai-vision', name: 'Vision Entrepreneurs', role: GroupRole.member, memberCount: 8, cycleIndex: 5, cycleTotal: 8, contributionAmountXaf: 50000, nextDueAtUtc: nextDue.add(const Duration(days: 3))),
    ];
    history = <Contribution>[
      for (int i = 0; i < 3; i++)
        Contribution(
          id: 'essai-cot-${i + 1}',
          groupId: 'essai-etoiles',
          obligationId: 'essai-obl-${i + 1}',
          amountXaf: 25000,
          status: ContributionStatus.validated,
          channel: PaymentChannel.mobileMoney,
          declaredAtUtc: DateTime.utc(cycleStart.year, cycleStart.month + i, 12),
        ),
    ];
    pending = <ValidationItem>[
      ValidationItem(contributionId: 'essai-val-1', groupId: 'essai-bamileke', memberIdentityId: 'essai-membre-5', memberDisplayName: 'Linda Mbarga', amountXaf: 15000, declaredAtUtc: now.subtract(const Duration(hours: 2)), version: 1, evidenceName: 'recu-orange-money.jpg'),
      ValidationItem(contributionId: 'essai-val-2', groupId: 'essai-bamileke', memberIdentityId: 'essai-membre-8', memberDisplayName: 'Joëlle Bilong', amountXaf: 15000, declaredAtUtc: now.subtract(const Duration(days: 1)), version: 1),
    ];
    votes = <VoteSummary>[
      VoteSummary(id: 'essai-vote-1', groupId: 'essai-etoiles', title: 'Passer la cotisation à 30 000 XAF au prochain cycle', opensAtUtc: now.subtract(const Duration(days: 2)), closesAtUtc: now.add(const Duration(days: 5)), hasCurrentUserVoted: false),
      VoteSummary(id: 'essai-vote-2', groupId: 'essai-etoiles', title: 'Accueillir un 13e membre', opensAtUtc: now.subtract(const Duration(days: 20)), closesAtUtc: now.subtract(const Duration(days: 13)), hasCurrentUserVoted: true),
    ];
    notifications = <KombeNotification>[
      KombeNotification(id: 'n1', kind: NotificationKind.validation, title: 'Paul Abega — cotisation validée', body: 'Par le trésorier · tour 4', createdAtUtc: now.subtract(const Duration(hours: 2)), read: false),
      KombeNotification(id: 'n2', kind: NotificationKind.contribution, title: 'Marie Abena a déclaré sa cotisation', body: 'En attente de validation', createdAtUtc: now.subtract(const Duration(days: 1)), read: true),
      KombeNotification(id: 'n3', kind: NotificationKind.vote, title: 'Nouveau vote ouvert', body: 'Passer la cotisation à 30 000 XAF', createdAtUtc: now.subtract(const Duration(days: 2)), read: true),
      KombeNotification(id: 'n4', kind: NotificationKind.meeting, title: 'Réunion du groupe samedi', body: 'Chez Amina, 16 h', createdAtUtc: now.subtract(const Duration(days: 4)), read: true),
    ];
    fines = <MyFine>[
      MyFine(fineId: 'essai-amende-1', groupId: 'essai-etoiles', groupName: 'Les Étoiles de Yaoundé', kind: 'meeting_late', amountXaf: 500, reason: 'Arrivée après l’appel', state: FineState.issued, issuedAtUtc: now.subtract(const Duration(days: 6)), issuedByName: 'Éric Kamga'),
    ];
  }

  static const List<String> _names = <String>[
    'Paul Abega', 'Amina Tchoua', 'Serge Nkoué', 'Marie Abena', 'Linda Mbarga', 'Chantal Abega',
    'Éric Kamga', 'Joëlle Bilong', 'Didier Fotso', 'Rose Essomba', 'Alain Mbida', 'Grâce Onana',
  ];

  late final List<BeneficiaryTurn> turns;
  late final List<GroupMember> members;
  late final DateTime nextDue;
  late final List<GroupSummary> groups;
  late final List<Contribution> history;
  late final List<ValidationItem> pending;
  late final List<VoteSummary> votes;
  late final List<KombeNotification> notifications;
  late final List<MyFine> fines;
  int _seq = 100;
  String nextId(String prefix) => 'essai-$prefix-${_seq++}';
}

final class FakeAuthRepository implements AuthRepository {
  FakeAuthRepository();
  final StreamController<Resource<AuthSession?>> _ctrl = StreamController<Resource<AuthSession?>>.broadcast();
  AuthSession? _session;

  @override
  Stream<Resource<AuthSession?>> watchSession() async* {
    yield ResourceReady<AuthSession?>(_session);
    yield* _ctrl.stream;
  }

  @override
  Future<Resource<AuthChannels>> loadChannels() async =>
      const ResourceReady<AuthChannels>(AuthChannels(email: true, sms: false, whatsapp: false));

  @override
  Future<OperationResult<void>> requestCode({required String login, required LoginChannel channel}) async {
    await _lag();
    return const OperationSuccess<void>(null);
  }

  /// En essai, n'importe quel code est accepté (aucun message n'est envoyé).
  @override
  Future<OperationResult<AuthSession>> verifyCode({required String login, required String code}) async {
    await _lag();
    final AuthSession s = AuthSession(
      identityId: login.isEmpty ? 'essai@kombe.app' : login,
      accountStatus: AccountStatus.active,
      expiresAtUtc: DateTime.now().toUtc().add(const Duration(days: 30)),
    );
    _session = s;
    _ctrl.add(ResourceReady<AuthSession?>(s));
    return OperationSuccess<AuthSession>(s);
  }

  @override
  Future<OperationResult<void>> signOut() async {
    _session = null;
    _ctrl.add(const ResourceReady<AuthSession?>(null));
    return const OperationSuccess<void>(null);
  }
}

final class FakeProfileRepository implements ProfileRepository {
  UserProfile _p = const UserProfile(identityId: 'essai@kombe.app', displayName: 'Amina Ngué', phoneE164: '+237670123456', localeCode: 'fr');

  @override
  Future<Resource<UserProfile>> loadProfile() async {
    await _lag();
    return ResourceReady<UserProfile>(_p);
  }

  @override
  Future<OperationResult<UserProfile>> updateProfile({required String displayName, required String localeCode}) async {
    await _lag();
    _p = UserProfile(identityId: _p.identityId, displayName: displayName, phoneE164: _p.phoneE164, localeCode: localeCode);
    return OperationSuccess<UserProfile>(_p);
  }
}

final class FakeGroupRepository implements GroupRepository {
  FakeGroupRepository(this.w);
  final FakeWorld w;

  GroupSummary? _g(String id) {
    for (final GroupSummary g in w.groups) {
      if (g.id == id) return g;
    }
    return null;
  }

  @override
  Future<Resource<List<GroupSummary>>> listGroups() async {
    await _lag();
    return ResourceReady<List<GroupSummary>>(List<GroupSummary>.unmodifiable(w.groups));
  }

  @override
  Future<Resource<GroupDetails>> getGroup(String groupId) async {
    await _lag();
    final GroupSummary? g = _g(groupId);
    if (g == null) return const ResourceUnavailable<GroupDetails>();
    return ResourceReady<GroupDetails>(
      GroupDetails(summary: g, description: 'Unissons nos forces pour bâtir ensemble. (Groupe fictif.)', currentRulesVersion: 3),
    );
  }

  @override
  Future<Resource<List<GroupMember>>> listMembers(String groupId) async {
    await _lag();
    final int n = _g(groupId)?.memberCount ?? 0;
    return ResourceReady<List<GroupMember>>(w.members.take(n).toList());
  }

  @override
  Future<Resource<GroupMember>> getMember(String groupId, String identityId) async {
    await _lag(200);
    for (final GroupMember m in w.members) {
      if (m.identityId == identityId) return ResourceReady<GroupMember>(m);
    }
    return const ResourceUnavailable<GroupMember>();
  }

  @override
  Future<Resource<CycleDetails>> getCycle(String groupId) async {
    await _lag();
    final GroupSummary? g = _g(groupId);
    if (g == null || g.cycleTotal == 0) return const ResourceUnavailable<CycleDetails>();
    final List<BeneficiaryTurn> turns = <BeneficiaryTurn>[
      for (int i = 0; i < g.cycleTotal; i++)
        BeneficiaryTurn(
          turnNumber: i + 1,
          identityId: w.turns[i].identityId,
          displayName: w.turns[i].displayName,
          dueAtUtc: w.turns[i].dueAtUtc,
          status: i + 1 < g.cycleIndex ? BeneficiaryStatus.received : i + 1 == g.cycleIndex ? BeneficiaryStatus.current : BeneficiaryStatus.upcoming,
        ),
    ];
    return ResourceReady<CycleDetails>(
      CycleDetails(id: 'essai-cycle-$groupId', groupId: groupId, currentTurn: g.cycleIndex, totalTurns: g.cycleTotal, beneficiaries: turns),
    );
  }

  @override
  Future<Resource<List<String>>> getRules(String groupId) async {
    await _lag();
    return const ResourceReady<List<String>>(<String>[
      'Cotisation mensuelle fixe, déclarée avant le 15 du mois.',
      'L’ordre des bénéficiaires est tiré au sort puis gelé au démarrage du cycle.',
      'Toute cotisation est validée par le trésorier ou le contrôleur, jamais par le déclarant.',
      'Un changement de règle exige un vote à la majorité des deux tiers.',
      'Un retard de plus de 7 jours ouvre un échange avec le bureau du groupe.',
    ]);
  }

  @override
  Future<OperationResult<void>> joinGroup(String invitationCode) async {
    await _lag();
    return const OperationSuccess<void>(null);
  }

  @override
  Future<OperationResult<GroupInvitation>> createInvitation(String groupId) async {
    await _lag();
    return OperationSuccess<GroupInvitation>(GroupInvitation(
      invitationId: 'essai-inv-1',
      code: 'ESSAI234',
      url: 'https://kombe.example/#/rejoindre/ESSAI234',
      whatsappText: 'Rejoins notre tontine sur KÓMBE : https://kombe.example/#/rejoindre/ESSAI234 (code ESSAI234).',
      expiresAtUtc: DateTime.now().toUtc().add(const Duration(days: 14)),
      maxUses: 30,
      usedCount: 0,
    ));
  }

  @override
  Future<OperationResult<void>> decideAdmission({required String groupId, required String membershipId, required bool admit}) async {
    await _lag();
    return const OperationSuccess<void>(null);
  }

  @override
  Future<OperationResult<void>> proposeRole({required String groupId, required String membershipId, required String role}) async {
    await _lag();
    return const OperationSuccess<void>(null);
  }

  @override
  Future<OperationResult<void>> acceptRole({required String groupId, required String role}) async {
    await _lag();
    return const OperationSuccess<void>(null);
  }

  TontineStatutes _statutes() => TontineStatutes(
        version: 1,
        title: 'Statuts du groupe (fictifs)',
        body: 'Article 1 — Objet.\nArticle 2 — Cotisations.',
        hash: List<String>.filled(64, 'a').join(),
        publishedAtUtc: w.nextDue.subtract(const Duration(days: 10)),
        acceptedByMe: false,
        acceptedCount: 3,
        expectedCount: 12,
        deadline: StatutesDeadline(deadlineAtUtc: w.nextDue, acceptanceDays: 7, onExpiry: StatutesOnExpiry.exclude),
        myDeadlineAtUtc: w.nextDue,
      );

  @override
  Future<Resource<TontineStatutes?>> getStatutes(String groupId) async {
    await _lag();
    return ResourceReady<TontineStatutes?>(_statutes());
  }

  @override
  Future<OperationResult<TontineStatutes>> acceptStatutes({required String groupId, required String hash}) async {
    await _lag();
    return OperationSuccess<TontineStatutes>(_statutes());
  }

  @override
  Future<OperationResult<TontineStatutes>> publishStatutes({
    required String groupId,
    required int acceptanceDays,
    required StatutesOnExpiry onExpiry,
  }) async {
    await _lag();
    return OperationSuccess<TontineStatutes>(_statutes());
  }

  @override
  Future<OperationResult<TontineStatutes>> extendStatutesDeadline({
    required String groupId,
    required int extendDays,
    StatutesOnExpiry? onExpiry,
  }) async {
    await _lag();
    return OperationSuccess<TontineStatutes>(_statutes());
  }

  @override
  Future<OperationResult<int>> remindStatutes(String groupId) async {
    await _lag();
    return const OperationSuccess<int>(9);
  }

  @override
  Future<OperationResult<String>> createGroup(TontineCreation draft) async {
    await _lag();
    w.groups.insert(
      0,
      GroupSummary(
        id: 'grp-fake-${w.groups.length + 1}',
        name: draft.name,
        role: GroupRole.administrator,
        memberCount: 1,
        cycleIndex: 0,
        cycleTotal: 0,
        contributionAmountXaf: int.tryParse(draft.contributionPerShare) ?? 0,
        nextDueAtUtc: w.nextDue,
      ),
    );
    return const OperationSuccess<String>('grp-fake-1');
  }

  @override
  Future<OperationResult<void>> startCycle(String groupId, CycleOrderKind order) async {
    await _lag();
    return _planifierCycle(groupId, order);
  }

  @override
  Future<OperationResult<void>> renewCycle(String groupId, CycleOrderKind order) async {
    await _lag();
    return _planifierCycle(groupId, order);
  }

  Future<OperationResult<void>> _planifierCycle(String groupId, CycleOrderKind order) async {
    final GroupSummary? g = _g(groupId);
    if (g == null) return const OperationFailure<void>(ApiFailure(statusCode: 404, code: 'OBJET_INTROUVABLE'));
    if (g.memberCount < 2) {
      return const OperationFailure<void>(
        ApiFailure(statusCode: 409, code: 'CYCLE_START_NOT_READY', message: 'Au moins deux membres actifs'),
      );
    }
    final int index = w.groups.indexOf(g);
    w.groups[index] = GroupSummary(
      id: g.id,
      name: g.name,
      role: g.role,
      memberCount: g.memberCount,
      cycleIndex: 1,
      cycleTotal: g.cycleIndex > 0 ? g.cycleTotal : g.memberCount,
      contributionAmountXaf: g.contributionAmountXaf,
      nextDueAtUtc: w.nextDue,
    );
    return const OperationSuccess<void>(null);
  }

  @override
  Future<Resource<List<MemberGroup>>> listMyGroups() async {
    await _lag();
    return ResourceReady<List<MemberGroup>>(<MemberGroup>[
      for (final GroupSummary g in w.groups)
        MemberGroup(
          groupId: g.id,
          displayName: g.name,
          groupState: 'active',
          membershipState: 'active',
        ),
    ]);
  }
}

final class FakeContributionRepository implements ContributionRepository {
  FakeContributionRepository(this.w);
  final FakeWorld w;

  @override
  Future<Resource<List<Contribution>>> listHistory({String? groupId}) async {
    await _lag();
    final List<Contribution> rows = w.history.where((Contribution c) => groupId == null || c.groupId == groupId).toList()
      ..sort((Contribution a, Contribution b) => (b.declaredAtUtc ?? DateTime(0)).compareTo(a.declaredAtUtc ?? DateTime(0)));
    return ResourceReady<List<Contribution>>(rows);
  }

  @override
  Future<Resource<Contribution>> getContribution(String contributionId) async {
    await _lag(200);
    for (final Contribution c in w.history) {
      if (c.id == contributionId) return ResourceReady<Contribution>(c);
    }
    return const ResourceUnavailable<Contribution>();
  }

  /// La déclaration rejoint l'historique « en attente » — jamais « validée ».
  @override
  Future<OperationResult<Contribution>> submitDraft(ContributionDraft draft) async {
    await _lag(700);
    final Contribution c = Contribution(
      id: w.nextId('cot'),
      groupId: draft.groupId,
      obligationId: w.nextId('obl'),
      amountXaf: draft.amountXaf,
      status: ContributionStatus.submitted,
      channel: draft.channel,
      declaredAtUtc: DateTime.now().toUtc(),
      note: draft.note,
      evidenceName: draft.evidencePath?.split(RegExp(r'[\\/]')).last,
    );
    w.history.add(c);
    w.notifications.insert(
      0,
      KombeNotification(id: w.nextId('n'), kind: NotificationKind.contribution, title: 'Votre déclaration a été envoyée', body: 'En attente de validation', createdAtUtc: DateTime.now().toUtc(), read: false),
    );
    return OperationSuccess<Contribution>(c);
  }
}

final class FakeGovernanceRepository implements GovernanceRepository {
  FakeGovernanceRepository(this.w);
  final FakeWorld w;
  final Set<String> _voted = <String>{};

  @override
  Future<Resource<List<ValidationItem>>> listPendingValidations() async {
    await _lag();
    return ResourceReady<List<ValidationItem>>(List<ValidationItem>.unmodifiable(w.pending));
  }

  @override
  Future<Resource<ValidationItem>> getValidation(String contributionId) async {
    await _lag(200);
    for (final ValidationItem v in w.pending) {
      if (v.contributionId == contributionId) return ResourceReady<ValidationItem>(v);
    }
    return const ResourceUnavailable<ValidationItem>();
  }

  @override
  Future<OperationResult<void>> decideValidation({required String contributionId, required int expectedVersion, required ValidationDecision decision, String? reason}) async {
    await _lag(600);
    w.pending.removeWhere((ValidationItem v) => v.contributionId == contributionId);
    return const OperationSuccess<void>(null);
  }

  @override
  Future<Resource<List<VoteSummary>>> listVotes() async {
    await _lag();
    return ResourceReady<List<VoteSummary>>(<VoteSummary>[
      for (final VoteSummary v in w.votes)
        VoteSummary(id: v.id, groupId: v.groupId, title: v.title, opensAtUtc: v.opensAtUtc, closesAtUtc: v.closesAtUtc, hasCurrentUserVoted: v.hasCurrentUserVoted || _voted.contains(v.id)),
    ]);
  }

  @override
  Future<Resource<VoteDetails>> getVote(String voteId) async {
    await _lag(250);
    for (final VoteSummary v in w.votes) {
      if (v.id == voteId) {
        return ResourceReady<VoteDetails>(VoteDetails(
          summary: VoteSummary(id: v.id, groupId: v.groupId, title: v.title, opensAtUtc: v.opensAtUtc, closesAtUtc: v.closesAtUtc, hasCurrentUserVoted: v.hasCurrentUserVoted || _voted.contains(v.id)),
          description: 'Proposition soumise par le bureau du groupe. Elle s’appliquera au prochain cycle seulement, jamais en arrière.',
          electorate: 15,
          requiredYes: 8,
          ballots: 3,
        ));
      }
    }
    return const ResourceUnavailable<VoteDetails>();
  }

  @override
  Future<OperationResult<void>> castVote({required String voteId, required VoteChoice choice}) async {
    await _lag(600);
    _voted.add(voteId);
    return const OperationSuccess<void>(null);
  }
}

final class FakeFineRepository implements FineRepository {
  FakeFineRepository(this.w);
  final FakeWorld w;

  @override
  Future<Resource<List<MyFine>>> listMyFines() async {
    await _lag();
    return ResourceReady<List<MyFine>>(List<MyFine>.unmodifiable(w.fines));
  }

  @override
  Future<OperationResult<MyFine>> contestFine({required MyFine fine, required String reason}) async {
    await _lag(600);
    final MyFine c = MyFine(
      fineId: fine.fineId,
      groupId: fine.groupId,
      groupName: fine.groupName,
      kind: fine.kind,
      amountXaf: fine.amountXaf,
      reason: fine.reason,
      state: FineState.contested,
      issuedAtUtc: fine.issuedAtUtc,
      issuedByName: fine.issuedByName,
    );
    w.fines[w.fines.indexWhere((MyFine f) => f.fineId == fine.fineId)] = c;
    return OperationSuccess<MyFine>(c);
  }
}

final class FakeNotificationRepository implements NotificationRepository {
  FakeNotificationRepository(this.w);
  final FakeWorld w;

  @override
  Future<Resource<List<KombeNotification>>> listNotifications() async {
    await _lag();
    return ResourceReady<List<KombeNotification>>(List<KombeNotification>.unmodifiable(w.notifications));
  }

  @override
  Future<OperationResult<void>> markRead(String notificationId) async {
    final int i = w.notifications.indexWhere((KombeNotification n) => n.id == notificationId);
    if (i >= 0) {
      final KombeNotification n = w.notifications[i];
      w.notifications[i] = n.copyWith(read: true);
    }
    return const OperationSuccess<void>(null);
  }
}

final class FakeDocumentRepository implements DocumentRepository {
  @override
  Future<Resource<List<KombeDocument>>> listDocuments() async {
    await _lag();
    final DateTime now = DateTime.now().toUtc();
    return ResourceReady<List<KombeDocument>>(<KombeDocument>[
      KombeDocument(id: 'd1', kind: DocumentKind.rules, title: 'Règles du groupe — version 3', createdAtUtc: now.subtract(const Duration(days: 40)), downloadUri: Uri.parse('about:blank')),
      KombeDocument(id: 'd2', kind: DocumentKind.cycleReport, title: 'Relevé du cycle — tours 1 à 3', createdAtUtc: now.subtract(const Duration(days: 8)), downloadUri: Uri.parse('about:blank')),
    ]);
  }
}

final class FakeDashboardRepository implements DashboardRepository {
  FakeDashboardRepository(this.w);
  final FakeWorld w;

  @override
  Future<Resource<DashboardData>> loadDashboard() async {
    await _lag(500);
    final int declared = w.history
        .where((Contribution c) => c.declaredAtUtc != null && c.declaredAtUtc!.month == DateTime.now().toUtc().month)
        .fold<int>(0, (int s, Contribution c) => s + c.amountXaf);
    return ResourceReady<DashboardData>(DashboardData(
      primaryGroup: w.groups.first,
      nextContributionAtUtc: w.nextDue,
      currentMonthDeclaredXaf: declared,
      progressPercent: declared == 0 ? 0 : 100,
      recentActivity: w.notifications.take(4).toList(),
    ));
  }
}

/// Dépendances complètes de l'app branchées sur les dépôts factices (tests uniquement).
AppDependencies fakeDependencies() {
  final FakeWorld world = FakeWorld();
  return AppDependencies(
    authRepository: FakeAuthRepository(),
    profileRepository: FakeProfileRepository(),
    groupRepository: FakeGroupRepository(world),
    contributionRepository: FakeContributionRepository(world),
    governanceRepository: FakeGovernanceRepository(world),
    fineRepository: FakeFineRepository(world),
    notificationRepository: FakeNotificationRepository(world),
    documentRepository: FakeDocumentRepository(),
    dashboardRepository: FakeDashboardRepository(world),
    draftRepository: ContributionDraftDatabase(),
    preferencesRepository: PreferencesRepositoryImpl(SharedPreferencesAsync()),
    biometricService: BiometricService(LocalAuthentication()),
    secureSessionStore: const SecureSessionStore(FlutterSecureStorage()),
  );
}
