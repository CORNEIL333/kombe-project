enum GroupRole { member, treasurer, controller, secretary, administrator }

// ── Fonctions du bureau et droits (packages/domain/src/tontine/roles.ts) ──

/// Libellé terrain d'une fonction (identifiant technique de l'API).
String apiRoleLabel(String role) => switch (role) {
      'animator' => 'Président',
      'vice_president' => 'Vice-président',
      'secretary' => 'Secrétaire général',
      'treasurer' => 'Trésorier',
      'treasurer_deputy' => 'Trésorier adjoint',
      'auditor' => 'Commissaire aux comptes',
      'censor' => 'Censeur',
      'advisor' => 'Conseiller',
      _ => 'Membre',
    };

/// Fonctions du bureau qu'on peut proposer à un membre (tout sauf « membre »).
const List<String> bureauRoles = <String>[
  'animator',
  'vice_president',
  'secretary',
  'treasurer',
  'treasurer_deputy',
  'auditor',
  'censor',
  'advisor',
];

/// Actes réservés à certaines fonctions — mêmes listes que la matrice du
/// domaine (`MATRIX` de roles.ts) pour les routes appelées par le mobile.
/// Le serveur reste seul juge : un bouton affiché n'est qu'une invitation.
enum TontineAct {
  /// `member.invite` : président, vice-président, secrétaire général.
  invite,

  /// `member.admit` : président, vice-président.
  admit,

  /// `role.assign` : président, vice-président.
  assignRole,

  /// `statutes.publish` : président, vice-président, secrétaire général.
  publishStatutes,

  /// Démarrage du cycle : la route exige `schedule.manage` (président,
  /// vice-président, secrétaire général).
  startCycle,
}

extension TontineActRoles on TontineAct {
  Set<String> get roles => switch (this) {
        TontineAct.invite => const <String>{'animator', 'vice_president', 'secretary'},
        TontineAct.admit => const <String>{'animator', 'vice_president'},
        TontineAct.assignRole => const <String>{'animator', 'vice_president'},
        TontineAct.publishStatutes => const <String>{'animator', 'vice_president', 'secretary'},
        TontineAct.startCycle => const <String>{'animator', 'vice_president', 'secretary'},
      };
}

/// Rythme de séance (mêmes kinds que `cadenceSchema` serveur, API tontine
/// réelle). Chaque kind ne renseigne que ses champs propres.
enum CadenceKind {
  daily,
  weekly,
  biweekly,
  everyNDays,
  monthlyDay,
  monthlyNthWeekday,
}

String cadenceKindLabel(CadenceKind kind) => switch (kind) {
  CadenceKind.daily => 'Chaque jour',
  CadenceKind.weekly => 'Chaque semaine',
  CadenceKind.biweekly => 'Toutes les deux semaines',
  CadenceKind.everyNDays => 'Tous les n jours (ex. tous les 8 jours)',
  CadenceKind.monthlyDay => 'Chaque mois, à date fixe (ex. le 5)',
  CadenceKind.monthlyNthWeekday => 'Chaque mois, un jour précis (ex. 2e samedi)',
};

/// Bornes serveur de « tous les n jours » (`cadenceSchema`).
const int everyNDaysMin = 2;
const int everyNDaysMax = 31;

/// Paramètres que l'administrateur (le bureau) fournit à la CRÉATION d'une
/// tontine (API réelle `POST /v1/tontines`) : nom, cotisation par part et par
/// séance, rythme, date de première séance, heure limite de cotisation,
/// nombre max de membres, et les caisses annexes qu'il choisit d'ouvrir.
/// Aucun de ces choix n'est décidé à la place du bureau.
final class TontineCreation {
  const TontineCreation({
    required this.name,
    required this.contributionPerShare,
    required this.cadenceKind,
    this.weekday,
    this.dayOfMonth,
    this.nth,
    this.everyNDays,
    required this.firstMeetingDate,
    required this.deadlineTime,
    required this.maxMembers,
    this.meetingPlace,
    this.solidarityPerMeeting,
    this.operatingPerMeeting,
  });

  final String name;

  /// Montant entier XAF par part et par séance (chaîne de chiffres, jamais
  /// de décimales — ADR-0002) ; choisi par le bureau, jamais pré-rempli.
  final String contributionPerShare;
  final CadenceKind cadenceKind;

  /// 0 = dimanche … 6 = samedi (même convention que le serveur).
  final int? weekday;
  final int? dayOfMonth;
  final int? nth;
  final int? everyNDays;

  /// YYYY-MM-DD et HH:mm, formats validés par le serveur.
  final String firstMeetingDate;
  final String deadlineTime;
  final int maxMembers;
  final String? meetingPlace;

  /// Caisse de secours : montant par séance tapé par le bureau, `null` = caisse
  /// fermée (jamais de montant que le bureau n'a pas vu).
  final int? solidarityPerMeeting;

  /// Caisse de fonctionnement : même règle.
  final int? operatingPerMeeting;

  /// Cadence au format `cadenceSchema` serveur (discriminated union sur kind).
  /// Les champs propres au rythme sont exigés par le formulaire ; aucun n'est
  /// complété par une valeur par défaut.
  Map<String, dynamic> get cadenceJson => switch (cadenceKind) {
    CadenceKind.daily => <String, dynamic>{'kind': 'daily'},
    CadenceKind.weekly => <String, dynamic>{'kind': 'weekly', 'weekday': weekday!},
    CadenceKind.biweekly => <String, dynamic>{'kind': 'biweekly', 'weekday': weekday!},
    CadenceKind.monthlyDay => <String, dynamic>{'kind': 'monthly_day', 'day': dayOfMonth!},
    CadenceKind.monthlyNthWeekday => <String, dynamic>{
      'kind': 'monthly_nth_weekday',
      'weekday': weekday!,
      'nth': nth!,
    },
    CadenceKind.everyNDays => <String, dynamic>{'kind': 'every_n_days', 'n': everyNDays!},
  };
}

/// Vue consolidée MULTI-ADHÉSION d'une tontine pour un membre (C21 §2.5) :
/// projection `GET /me/groups` (`MemberGroupSummary` domaine). N'expose AUCUN
/// champ financier (contrairement à [GroupSummary], maquette non servie au
/// pilote) : identité de la tontine, son rôle dans la hiérarchie (parent de
/// supervision) et l'état de l'adhésion. Un membre peut en avoir plusieurs.
final class MemberGroup {
  const MemberGroup({
    required this.groupId,
    required this.displayName,
    required this.groupState,
    required this.membershipState,
    this.parentGroupId,
  });

  final String groupId;
  final String displayName;
  final String groupState;
  final String membershipState;
  final String? parentGroupId;
}

/// Étiquette lisible de l'état d'adhésion d'un membre dans une tontine.
String membershipStateLabel(String state) => switch (state) {
  'active' => 'Membre actif',
  'pending' => 'Adhésion en attente',
  'revoked' => 'Révoqué',
  _ => 'Parti',
};

final class GroupSummary {
  const GroupSummary({
    required this.id,
    required this.name,
    required this.role,
    required this.memberCount,
    required this.cycleIndex,
    required this.cycleTotal,
    required this.contributionAmountXaf,
    required this.nextDueAtUtc,
    this.coverUrl,
    this.apiRoles = const <String>{},
  });

  final String id;
  final String name;
  final GroupRole role;
  final int memberCount;
  final int cycleIndex;
  final int cycleTotal;
  final int contributionAmountXaf;
  final DateTime nextDueAtUtc;
  final Uri? coverUrl;

  /// Fonctions acceptées par la personne connectée (identifiants API).
  final Set<String> apiRoles;

  /// Vrai si l'une de mes fonctions ouvre l'acte (même matrice que le
  /// serveur). Sans fonctions API connues, la fonction affichée fait foi.
  bool can(TontineAct act) {
    final Set<String> mine = apiRoles.isNotEmpty
        ? apiRoles
        : switch (role) {
            GroupRole.administrator => const <String>{'animator'},
            GroupRole.secretary => const <String>{'secretary'},
            GroupRole.treasurer => const <String>{'treasurer'},
            GroupRole.controller => const <String>{'auditor'},
            GroupRole.member => const <String>{'member'},
          };
    return mine.intersection(act.roles).isNotEmpty;
  }
}

final class GroupDetails {
  const GroupDetails({
    required this.summary,
    required this.description,
    required this.currentRulesVersion,
    this.pendingCount = 0,
    this.cycleStarted = false,
  });

  final GroupSummary summary;
  final String description;
  final int currentRulesVersion;

  /// Demandes d'adhésion en attente.
  final int pendingCount;
  final bool cycleStarted;
}

final class GroupMember {
  const GroupMember({
    required this.identityId,
    required this.displayName,
    required this.role,
    required this.joinedAtUtc,
    this.avatarUrl,
    this.state = 'active',
    this.apiRoles = const <String>[],
    this.pendingRoles = const <String>[],
    this.isMe = false,
    this.offline = false,
  });

  /// Identifiant d'adhésion (`membershipId`).
  final String identityId;
  final String displayName;
  final GroupRole role;
  final DateTime joinedAtUtc;
  final Uri? avatarUrl;

  /// `active` ou `pending` (demande d'adhésion à examiner).
  final String state;

  /// Fonctions acceptées (identifiants API, sans « member »).
  final List<String> apiRoles;

  /// Fonctions proposées, en attente d'acceptation par la personne.
  final List<String> pendingRoles;
  final bool isMe;

  /// Membre sans téléphone, représenté : ne tient pas de fonction.
  final bool offline;

  bool get pending => state == 'pending';
}

/// Lien d'invitation créé par le serveur (`InvitationView`) : le code, le
/// lien à partager et le texte prêt pour WhatsApp.
final class GroupInvitation {
  const GroupInvitation({
    required this.invitationId,
    required this.code,
    required this.url,
    required this.whatsappText,
    required this.expiresAtUtc,
    required this.maxUses,
    required this.usedCount,
  });

  final String invitationId;
  final String code;
  final String url;
  final String whatsappText;
  final DateTime expiresAtUtc;
  final int maxUses;
  final int usedCount;
}

// ── Statuts (StatutesView) ───────────────────────────────────────────────

/// Conséquence à l'échéance d'acceptation des statuts.
enum StatutesOnExpiry { exclude, keep }

StatutesOnExpiry statutesOnExpiryFrom(Object? v) => '$v' == 'keep' ? StatutesOnExpiry.keep : StatutesOnExpiry.exclude;

extension StatutesOnExpiryApi on StatutesOnExpiry {
  String get apiName => this == StatutesOnExpiry.keep ? 'keep' : 'exclude';
}

final class StatutesDeadline {
  const StatutesDeadline({required this.deadlineAtUtc, required this.acceptanceDays, required this.onExpiry});

  final DateTime deadlineAtUtc;
  final int acceptanceDays;
  final StatutesOnExpiry onExpiry;
}

/// Personne qui n'a pas encore accepté la dernière version.
final class StatutesPendingSigner {
  const StatutesPendingSigner({required this.membershipId, required this.name, required this.state, this.deadlineAtUtc});

  final String membershipId;
  final String name;

  /// `active` ou `pending` (candidat pas encore admis).
  final String state;
  final DateTime? deadlineAtUtc;
}

final class TontineStatutes {
  const TontineStatutes({
    required this.version,
    required this.title,
    required this.body,
    required this.hash,
    required this.publishedAtUtc,
    required this.acceptedByMe,
    required this.acceptedCount,
    required this.expectedCount,
    this.deadline,
    this.myDeadlineAtUtc,
    this.pending = const <StatutesPendingSigner>[],
  });

  final int version;
  final String title;
  final String body;

  /// Empreinte du texte : l'acceptation porte sur CE texte précis.
  final String hash;
  final DateTime publishedAtUtc;
  final bool acceptedByMe;
  final int acceptedCount;
  final int expectedCount;
  final StatutesDeadline? deadline;
  final DateTime? myDeadlineAtUtc;
  final List<StatutesPendingSigner> pending;
}
