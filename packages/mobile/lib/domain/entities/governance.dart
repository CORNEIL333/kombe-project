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

/// Scrutin de l'assemblée (ADR-0038) : adopté à la majorité ABSOLUE des
/// électeurs, pas des seuls votants ; vote secret jusqu'au dépouillement.
final class VoteDetails {
  const VoteDetails({
    required this.summary,
    required this.description,
    required this.electorate,
    required this.requiredYes,
    required this.ballots,
  });

  final VoteSummary summary;
  final String description;

  /// Membres appelés à voter (la personne concernée ne vote pas).
  final int electorate;

  /// Nombre de « oui » nécessaires : plus de la moitié des électeurs.
  final int requiredYes;

  /// Bulletins déjà déposés (le décompte reste secret).
  final int ballots;
}
