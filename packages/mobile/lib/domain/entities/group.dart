enum GroupRole { member, treasurer, controller, secretary, administrator }

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
