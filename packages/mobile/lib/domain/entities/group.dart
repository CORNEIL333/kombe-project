enum GroupRole { member, treasurer, controller, secretary, administrator }

/// Modèles de tontine préconfigurés (C03 §2.2) — alignés sur le domaine
/// (@kombe/domain/src/tontine.ts). Le choix pré-remplit des règles
/// éditables ; ce n'est pas un invariant financier.
const List<String> tontineModels = <String>[
  'famille',
  'collegues',
  'fetes',
  'construction',
  'etudiant',
  'personnalise',
];

/// Étiquette lisible d'un modèle de tontine.
String tontineModelLabel(String model) => switch (model) {
  'famille' => 'Famille',
  'collegues' => 'Collègues',
  'fetes' => 'Fêtes',
  'construction' => 'Construction',
  'etudiant' => 'Étudiant',
  _ => 'Personnalisé',
};

/// Typologies de rotation (C03 §2.3). Seule `rotative_fermee` est
/// démarrable au pilote ; `tirage` et `negocie` sont reconnus à la
/// création mais leur démarrage échoue fermé (P1, recette dédiée).
const List<String> rotationTypes = <String>[
  'rotative_fermee',
  'tirage',
  'negocie',
];

String rotationTypeLabel(String type) => switch (type) {
  'rotative_fermee' => 'Rotation fermée (égale)',
  'tirage' => 'Tirage au sort',
  _ => 'Négocié',
};

/// Groupe proposé à la découverte publique : nom + modèle + typologie
/// seulement, JAMAIS de registre réel avant adhésion (C03 §4.1).
final class DiscoverableGroup {
  const DiscoverableGroup({
    required this.groupId,
    required this.name,
    required this.tontineModel,
    required this.rotationType,
  });

  final String groupId;
  final String name;
  final String tontineModel;
  final String rotationType;
}

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
