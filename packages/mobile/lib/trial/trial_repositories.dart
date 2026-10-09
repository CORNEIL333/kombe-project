// KÓMBE — MODE ESSAI (30 jours) : dépôts en mémoire pour tester l'UI/UX.
//
// ISOLEMENT GARANTI : ce dossier n'est importé QUE par `lib/main_trial.dart`
// (build `-t lib/main_trial.dart`). L'application de production (`main.dart`,
// `app/`, `features/`, `core/`) n'y fait jamais référence — vérifié par
// `test/data/no_embedded_business_data_test.dart`. Toutes les données ci-dessous
// sont FICTIVES et l'interface l'affiche en permanence (bandeau « Mode essai »).
import 'dart:async';

import '../core/state/operation_result.dart';
import '../core/state/resource.dart';
import '../domain/entities/auth.dart';
import '../domain/entities/contribution.dart';
import '../domain/entities/cycle.dart';
import '../domain/entities/dashboard.dart';
import '../domain/entities/dispute.dart';
import '../domain/entities/document.dart';
import '../domain/entities/governance.dart';
import '../domain/entities/group.dart';
import '../domain/entities/notification.dart';
import '../domain/entities/profile.dart';
import '../domain/repositories/auth_repository.dart';
import '../domain/repositories/contribution_repository.dart';
import '../domain/repositories/dashboard_repository.dart';
import '../domain/repositories/dispute_repository.dart';
import '../domain/repositories/document_repository.dart';
import '../domain/repositories/governance_repository.dart';
import '../domain/repositories/group_repository.dart';
import '../domain/repositories/notification_repository.dart';
import '../domain/repositories/profile_repository.dart';

/// Latence simulée : assez pour voir les états de chargement, jamais bloquante.
Future<void> _lag([int ms = 380]) => Future<void>.delayed(Duration(milliseconds: ms));

/// État partagé du bac à sable : les actions d'un écran se voient dans les autres.
final class TrialWorld {
  TrialWorld() {
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
    disputes = <DisputeSummary>[
      DisputeSummary(id: 'essai-lit-1', groupId: 'essai-etoiles', subject: 'Cotisation de mars non retrouvée', status: DisputeStatus.underReview, openedAtUtc: now.subtract(const Duration(days: 6))),
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
  late final List<DisputeSummary> disputes;
  int _seq = 100;
  String nextId(String prefix) => 'essai-$prefix-${_seq++}';
}

final class TrialAuthRepository implements AuthRepository {
  TrialAuthRepository();
  final StreamController<Resource<AuthSession?>> _ctrl = StreamController<Resource<AuthSession?>>.broadcast();
  AuthSession? _session;

  @override
  Stream<Resource<AuthSession?>> watchSession() async* {
    yield ResourceReady<AuthSession?>(_session);
    yield* _ctrl.stream;
  }

  @override
  Future<OperationResult<void>> requestRegistration(String identityId) async {
    await _lag();
    return const OperationSuccess<void>(null);
  }

  @override
  Future<OperationResult<AccountStatus>> verifyRegistration({required String identityId, required String code}) async {
    await _lag();
    return const OperationSuccess<AccountStatus>(AccountStatus.active);
  }

  @override
  Future<OperationResult<void>> requestLogin(String identityId) async {
    await _lag();
    return const OperationSuccess<void>(null);
  }

  /// En essai, n'importe quel code est accepté (aucun email n'est envoyé).
  @override
  Future<OperationResult<AuthSession>> completeLogin({required String identityId, required String code}) async {
    await _lag();
    final AuthSession s = AuthSession(
      identityId: identityId.isEmpty ? 'essai@kombe.app' : identityId,
      accountStatus: AccountStatus.active,
      expiresAtUtc: DateTime.now().toUtc().add(const Duration(days: 30)),
    );
    _session = s;
    _ctrl.add(ResourceReady<AuthSession?>(s));
    return OperationSuccess<AuthSession>(s);
  }

  @override
  Future<OperationResult<void>> requestRecovery(String identityId) async => const OperationSuccess<void>(null);

  @override
  Future<OperationResult<void>> completeRecovery({required String identityId, required String code}) async =>
      const OperationSuccess<void>(null);

  @override
  Future<OperationResult<void>> signOut() async {
    _session = null;
    _ctrl.add(const ResourceReady<AuthSession?>(null));
    return const OperationSuccess<void>(null);
  }
}

final class TrialProfileRepository implements ProfileRepository {
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

  @override
  Future<OperationResult<void>> changePin({required String currentPin, required String newPin}) async {
    await _lag();
    return const OperationSuccess<void>(null);
  }
}

final class TrialGroupRepository implements GroupRepository {
  TrialGroupRepository(this.w);
  final TrialWorld w;

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
      GroupDetails(summary: g, description: 'Unissons nos forces pour bâtir ensemble. (Groupe fictif — mode essai.)', currentRulesVersion: 3),
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
    if (g == null) return const ResourceUnavailable<CycleDetails>();
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
  Future<OperationResult<void>> inviteMember({required String groupId, required String phoneE164}) async {
    await _lag();
    return const OperationSuccess<void>(null);
  }
}

final class TrialContributionRepository implements ContributionRepository {
  TrialContributionRepository(this.w);
  final TrialWorld w;

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

final class TrialGovernanceRepository implements GovernanceRepository {
  TrialGovernanceRepository(this.w);
  final TrialWorld w;
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
  Future<OperationResult<void>> decideValidation({required String contributionId, required int expectedVersion, required ValidationDecision decision}) async {
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
          rulesVersion: 3,
          quorum: 8,
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

final class TrialDisputeRepository implements DisputeRepository {
  TrialDisputeRepository(this.w);
  final TrialWorld w;

  @override
  Future<Resource<List<DisputeSummary>>> listDisputes() async {
    await _lag();
    return ResourceReady<List<DisputeSummary>>(List<DisputeSummary>.unmodifiable(w.disputes));
  }

  @override
  Future<Resource<DisputeDetails>> getDispute(String disputeId) async {
    await _lag(250);
    for (final DisputeSummary d in w.disputes) {
      if (d.id == disputeId) {
        return ResourceReady<DisputeDetails>(DisputeDetails(
          summary: d,
          description: 'La cotisation de mars n’apparaît pas dans l’historique alors que le membre affirme l’avoir versée.',
          timeline: <DisputeTimelineEntry>[
            DisputeTimelineEntry(label: 'Litige ouvert', atUtc: d.openedAtUtc),
            DisputeTimelineEntry(label: 'Justificatif demandé au membre', atUtc: d.openedAtUtc.add(const Duration(days: 1))),
            DisputeTimelineEntry(label: 'Examen par le contrôleur', atUtc: d.openedAtUtc.add(const Duration(days: 3))),
          ],
        ));
      }
    }
    return const ResourceUnavailable<DisputeDetails>();
  }

  @override
  Future<OperationResult<DisputeSummary>> openDispute({required String groupId, required String subject, required String description, String? relatedOperationId}) async {
    await _lag(600);
    final DisputeSummary d = DisputeSummary(id: w.nextId('lit'), groupId: groupId, subject: subject, status: DisputeStatus.open, openedAtUtc: DateTime.now().toUtc());
    w.disputes.insert(0, d);
    return OperationSuccess<DisputeSummary>(d);
  }
}

final class TrialNotificationRepository implements NotificationRepository {
  TrialNotificationRepository(this.w);
  final TrialWorld w;

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
      w.notifications[i] = KombeNotification(id: n.id, kind: n.kind, title: n.title, body: n.body, createdAtUtc: n.createdAtUtc, read: true);
    }
    return const OperationSuccess<void>(null);
  }
}

final class TrialDocumentRepository implements DocumentRepository {
  @override
  Future<Resource<List<KombeDocument>>> listDocuments() async {
    await _lag();
    final DateTime now = DateTime.now().toUtc();
    return ResourceReady<List<KombeDocument>>(<KombeDocument>[
      KombeDocument(id: 'd1', kind: DocumentKind.rules, title: 'Règles du groupe — version 3', createdAtUtc: now.subtract(const Duration(days: 40)), downloadUri: Uri.parse('about:blank')),
      KombeDocument(id: 'd2', kind: DocumentKind.cycleReport, title: 'Relevé du cycle — tours 1 à 3', createdAtUtc: now.subtract(const Duration(days: 8)), downloadUri: Uri.parse('about:blank')),
    ]);
  }

  @override
  Future<Resource<List<KombeDocument>>> listExports() async {
    await _lag();
    return const ResourceReady<List<KombeDocument>>(<KombeDocument>[]);
  }
}

final class TrialDashboardRepository implements DashboardRepository {
  TrialDashboardRepository(this.w);
  final TrialWorld w;

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
