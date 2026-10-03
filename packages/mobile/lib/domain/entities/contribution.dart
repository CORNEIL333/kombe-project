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
    required this.channel,
    required this.status,
    required this.declaredAtUtc,
    this.note,
    this.evidenceName,
  });

  final String id;
  final String groupId;
  final String obligationId;
  final int amountXaf;
  final PaymentChannel channel;
  final ContributionStatus status;
  final DateTime declaredAtUtc;
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
