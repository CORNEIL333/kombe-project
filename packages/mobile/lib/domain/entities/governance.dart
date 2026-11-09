/// Valider = CONFIRMER (trésorerie : le paiement est retrouvé) ou CONTRÔLER
/// (commissaire aux comptes : seconde vérification), selon [ValidationItem.control].
enum ValidationDecision { validate, reject }

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
    this.control = false,
    this.groupName = '',
    this.fundName = '',
    this.channel,
    this.memberPhotoVersion,
  });

  final String contributionId;
  final String groupId;
  final String memberIdentityId;
  final String memberDisplayName;
  final int? memberPhotoVersion;
  final int amountXaf;
  final DateTime declaredAtUtc;
  final int version;
  /// Référence de transaction déclarée (pas un fichier).
  final String? evidenceName;
  /// Contrôle du commissaire (déjà confirmé par la trésorerie) plutôt que confirmation.
  final bool control;
  final String groupName;
  final String fundName;
  final String? channel;
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
    this.state = 'open',
    this.myChoice,
    this.canVote = true,
    this.result,
  });

  final VoteSummary summary;
  /// `open`, `adopted`, `rejected`, `cancelled`, `lifted`.
  final String state;
  /// Mon bulletin, s'il est déjà déposé.
  final VoteChoice? myChoice;
  /// Faux si je ne suis pas électeur (ex. la personne concernée).
  final bool canVote;
  /// Décompte publié au dépouillement seulement.
  final ({int yes, int no, int abstain})? result;

  bool get open => state == 'open';
  final String description;

  /// Membres appelés à voter (la personne concernée ne vote pas).
  final int electorate;

  /// Nombre de « oui » nécessaires : plus de la moitié des électeurs.
  final int requiredYes;

  /// Bulletins déjà déposés (le décompte reste secret).
  final int ballots;
}
