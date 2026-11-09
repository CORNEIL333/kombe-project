/// Vote libre (`GET /v1/tontines/:id/polls`, migration 0041) : tout membre
/// actif pose une question au groupe avec ses réponses. Un vote libre donne
/// l'avis du groupe ; il ne déclenche aucun effet automatique.
enum PollState { open, closed, cancelled }

PollState pollStateFrom(Object? v) => switch ('$v') {
      'closed' => PollState.closed,
      'cancelled' => PollState.cancelled,
      _ => PollState.open,
    };

String pollStateLabel(PollState s) => switch (s) {
      PollState.open => 'Ouvert',
      PollState.closed => 'Terminé',
      PollState.cancelled => 'Annulé',
    };

final class PollVoter {
  const PollVoter({required this.name, required this.choices});
  final String name;
  final List<int> choices;
}

final class PollFreeAnswer {
  const PollFreeAnswer({required this.text, this.name});
  final String text;
  final String? name;
}

final class Poll {
  const Poll({
    required this.pollId,
    required this.groupId,
    required this.question,
    required this.options,
    required this.allowFreeAnswer,
    required this.multiple,
    required this.anonymous,
    required this.state,
    required this.createdByName,
    required this.createdAtUtc,
    required this.electorate,
    required this.ballotCount,
    required this.counts,
    required this.freeAnswers,
    required this.canManage,
    this.details,
    this.closesAtUtc,
    this.voters,
    this.myChoices,
    this.myFreeAnswer,
  });

  final String pollId;
  final String groupId;
  final String question;
  final String? details;
  final List<String> options;
  final bool allowFreeAnswer;
  final bool multiple;
  final bool anonymous;
  final PollState state;
  final String createdByName;
  final DateTime createdAtUtc;
  final DateTime? closesAtUtc;
  final int electorate;
  final int ballotCount;
  final List<int> counts;
  final List<PollFreeAnswer> freeAnswers;

  /// `null` si le vote est anonyme.
  final List<PollVoter>? voters;

  /// `null` si je n'ai pas encore répondu.
  final List<int>? myChoices;
  final String? myFreeAnswer;
  final bool canManage;

  bool get answered => myChoices != null;
}

/// Brouillon d'un vote libre.
final class PollDraft {
  const PollDraft({
    required this.question,
    required this.options,
    this.details,
    this.allowFreeAnswer = false,
    this.multiple = false,
    this.anonymous = false,
    this.hours,
  });

  final String question;
  final String? details;
  final List<String> options;
  final bool allowFreeAnswer;
  final bool multiple;
  final bool anonymous;
  final int? hours;
}
