enum GroupRole { member, treasurer, controller, secretary, administrator }

/// Rythme de séance (mêmes kinds que `cadenceSchema` serveur, API tontine
/// réelle). Chaque kind ne renseigne que ses champs propres.
enum CadenceKind {
  weekly,
  biweekly,
  monthlyDay,
  monthlyNthWeekday,
  everyNDays,
}

String cadenceKindLabel(CadenceKind kind) => switch (kind) {
  CadenceKind.weekly => 'Chaque semaine',
  CadenceKind.biweekly => 'Toutes les deux semaines',
  CadenceKind.monthlyDay => 'Chaque mois (quantième)',
  CadenceKind.monthlyNthWeekday => 'Chaque mois (jour précis)',
  CadenceKind.everyNDays => 'Tous les n jours',
};

/// Paramètres que l'administrateur (le bureau) fournit à la CRÉATION d'une
/// tontine (API réelle `POST /v1/tontines`) : nom, cotisation par part et par
/// séance, rythme, date de première séance, heure limite, nombre max de
/// membres. Aucun de ces choix n'est décidé à la place du bureau : le montant
/// et la fréquence sont des paramètres d'admin, collectés ici.
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

  /// Cadence au format `cadenceSchema` serveur (discriminated union sur kind).
  Map<String, dynamic> get cadenceJson => switch (cadenceKind) {
    CadenceKind.weekly => <String, dynamic>{'kind': 'weekly', 'weekday': weekday ?? 1},
    CadenceKind.biweekly => <String, dynamic>{'kind': 'biweekly', 'weekday': weekday ?? 1},
    CadenceKind.monthlyDay => <String, dynamic>{'kind': 'monthly_day', 'day': dayOfMonth ?? 5},
    CadenceKind.monthlyNthWeekday => <String, dynamic>{
      'kind': 'monthly_nth_weekday',
      'weekday': weekday ?? 1,
      'nth': nth ?? 1,
    },
    CadenceKind.everyNDays => <String, dynamic>{'kind': 'every_n_days', 'n': everyNDays ?? 7},
  };
}

/// Groupe proposé à la découverte publique : nom seulement. Le produit réel ne
/// publie aucun annuaire (les tontines restent privées ; on y entre par
/// invitation), cette vue reste vide — mais la forme est conservée pour le
/// parcours « parrainage ». JAMAIS de registre réel avant adhésion (C03 §4.1).
final class DiscoverableGroup {
  const DiscoverableGroup({
    required this.groupId,
    required this.name,
  });

  final String groupId;
  final String name;
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
}

final class GroupDetails {
  const GroupDetails({
    required this.summary,
    required this.description,
    required this.currentRulesVersion,
  });

  final GroupSummary summary;
  final String description;
  final int currentRulesVersion;
}

final class GroupMember {
  const GroupMember({
    required this.identityId,
    required this.displayName,
    required this.role,
    required this.joinedAtUtc,
    this.avatarUrl,
  });

  final String identityId;
  final String displayName;
  final GroupRole role;
  final DateTime joinedAtUtc;
  final Uri? avatarUrl;
}
