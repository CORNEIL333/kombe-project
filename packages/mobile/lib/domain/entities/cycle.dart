enum BeneficiaryStatus { received, current, upcoming }

/// Ordre de passage d'un cycle : se choisit à CHAQUE démarrage de cycle
/// (saison), jamais à la création de la tontine. Le tirage est vérifiable :
/// le serveur publie un engagement scellé, révèle la graine au démarrage et
/// journalise les deux — nul ne peut l'avoir truqué. L'application mobile
/// propose ces deux ordres ; elle n'annonce aucun autre mode.
enum CycleOrderKind { draw, joinOrder }

final class BeneficiaryTurn {
  const BeneficiaryTurn({
    required this.turnNumber,
    required this.identityId,
    required this.displayName,
    required this.dueAtUtc,
    required this.status,
    this.photoVersion,
    this.groupId = '',
    this.shareLabel,
  });

  final int turnNumber;
  final String identityId;
  final String displayName;
  final DateTime dueAtUtc;
  final BeneficiaryStatus status;
  final int? photoVersion;
  final String groupId;

  /// Nom (part) servi à ce tour (0041), quand il diffère du bénéficiaire.
  final String? shareLabel;
}

final class CycleDetails {
  const CycleDetails({
    required this.id,
    required this.groupId,
    required this.currentTurn,
    required this.totalTurns,
    required this.beneficiaries,
  });

  final String id;
  final String groupId;
  final int currentTurn;
  final int totalTurns;
  final List<BeneficiaryTurn> beneficiaries;
}
