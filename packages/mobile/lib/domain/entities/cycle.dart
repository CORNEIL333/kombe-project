enum BeneficiaryStatus { received, current, upcoming }

/// Ordre de passage d'un cycle : se choisit à CHAQUE démarrage de cycle
/// (saison), jamais à la création de la tontine. Le tirage est vérifiable :
/// le serveur publie un engagement scellé, révèle la graine au démarrage et
/// journalise les deux — nul ne peut l'avoir truqué. L'application mobile
/// propose ces deux ordres ; elle n'annonce aucun autre mode.
enum CycleOrderKind { draw, joinOrder }

extension CycleOrderKindLabel on CycleOrderKind {
  String get label => switch (this) {
        CycleOrderKind.draw => 'Tirage au sort vérifiable',
        CycleOrderKind.joinOrder => 'Ordre d’arrivée',
      };

  String get aide => switch (this) {
        CycleOrderKind.draw =>
          'Le serveur tire l’ordre au hasard et publie la preuve (engagement puis révélation). Chacun peut vérifier que rien n’a été truqué.',
        CycleOrderKind.joinOrder =>
          'Les parts passent dans l’ordre d’adhésion : les premières mains arrivées passent en premier. Les nouveaux arrivants passent en dernier.',
      };
}

final class BeneficiaryTurn {
  const BeneficiaryTurn({
    required this.turnNumber,
    required this.identityId,
    required this.displayName,
    required this.dueAtUtc,
    required this.status,
    this.avatarUrl,
  });

  final int turnNumber;
  final String identityId;
  final String displayName;
  final DateTime dueAtUtc;
  final BeneficiaryStatus status;
  final Uri? avatarUrl;
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
