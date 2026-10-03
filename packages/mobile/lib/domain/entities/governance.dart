enum ValidationDecision { validate, reject, requestInformation }

final class ValidationItem {
  const ValidationItem({
    required this.contributionId,
    required this.groupId,
    required this.memberIdentityId,
    required this.memberDisplayName,
    required this.amountXaf,
    required this.declaredAtUtc,
    required this.version,
    this.evidenceName,
  });

  final String contributionId;
  final String groupId;
  final String memberIdentityId;
  final String memberDisplayName;
  final int amountXaf;
  final DateTime declaredAtUtc;
  final int version;
  final String? evidenceName;
}

enum VoteChoice { forChoice, against, abstain }

final class VoteSummary {
  const VoteSummary({
    required this.id,
    required this.groupId,
    required this.title,
    required this.opensAtUtc,
    required this.closesAtUtc,
    required this.hasCurrentUserVoted,
  });

  final String id;
  final String groupId;
  final String title;
  final DateTime opensAtUtc;
  final DateTime closesAtUtc;
  final bool hasCurrentUserVoted;
}

final class VoteDetails {
  const VoteDetails({
    required this.summary,
    required this.description,
    required this.rulesVersion,
    required this.quorum,
  });

  final VoteSummary summary;
  final String description;
  final int rulesVersion;
  final int quorum;
}
