enum BeneficiaryStatus { received, current, upcoming }

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
