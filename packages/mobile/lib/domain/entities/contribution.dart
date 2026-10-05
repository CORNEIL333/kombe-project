enum PaymentChannel { mobileMoney, bankTransfer, cash }

enum ContributionStatus {
  draft,
  submitted,
  confirmed,
  validated,
  rejected,
  disputed,
  compensated,
}

final class Contribution {
  const Contribution({
    required this.id,
    required this.groupId,
    required this.obligationId,
    required this.amountXaf,
    required this.status,
    this.channel,
    this.declaredAtUtc,
    this.note,
    this.evidenceName,
  });

  final String id;
  final String groupId;
  final String obligationId;
  final int amountXaf;
  /// null quand le contrat de lecture (`Contribution`) ne rend pas le canal —
  /// la lecture ne l'invente jamais (ADR-0020, carte d'intégration API).
  final PaymentChannel? channel;
  final ContributionStatus status;
  /// Date d'enregistrement ; null si l'endpoint ne la rend pas — l'horodatage
  /// fait foi côté serveur (règle 18 / ADR-0005), le client ne la fabrique pas.
  final DateTime? declaredAtUtc;
  final String? note;
  final String? evidenceName;
}

final class ContributionDraft {
  const ContributionDraft({
    required this.localId,
    required this.groupId,
    required this.amountXaf,
    required this.channel,
    required this.updatedAtUtc,
    this.note,
    this.evidencePath,
  });

  final String localId;
  final String groupId;
  final int amountXaf;
  final PaymentChannel channel;
  final DateTime updatedAtUtc;
  final String? note;
  final String? evidencePath;
}
