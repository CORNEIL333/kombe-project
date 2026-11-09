import 'contribution.dart';
import 'group.dart';
import 'notification.dart';

/// Un vote ouvert sur lequel je n'ai pas encore voté.
final class PendingVote {
  const PendingVote({required this.id, required this.title, required this.closesAtUtc});
  final String id;
  final String title;
  final DateTime closesAtUtc;
}

/// Un tour du cycle : collecte confirmée face à la cagnotte attendue.
final class RoundProgress {
  const RoundProgress({required this.seq, required this.date, required this.collectedXaf, required this.expectedXaf, required this.open, this.label});
  final int seq;
  final DateTime date;
  final int collectedXaf;
  final int expectedXaf;
  final bool open;
  /// Nom (part) servi à ce tour, ou bénéficiaire.
  final String? label;

  double get ratio => expectedXaf <= 0 ? 0 : (collectedXaf / expectedXaf).clamp(0, 1).toDouble();
}

/// Accueil du groupe actif. Chaque champ vient d'une lecture serveur ; une
/// donnée absente reste absente (null, liste vide) — jamais un zéro inventé.
final class HomeData {
  const HomeData({
    required this.group,
    required this.dues,
    required this.nextDueDate,
    required this.pendingDeclaredXaf,
    required this.pendingDeclarations,
    required this.toValidate,
    required this.votes,
    required this.nextMeetingDate,
    required this.nextMeetingPlace,
    required this.recent,
    this.rounds = const <RoundProgress>[],
    this.openPolls = 0,
    this.nextMeetingOnline = false,
  });

  final GroupSummary group;
  /// Ce qui reste dû (par caisse et tour).
  final List<OpenDue> dues;
  final DateTime? nextDueDate;
  /// Mes déclarations pas encore confirmées par la trésorerie.
  final int pendingDeclaredXaf;
  final int pendingDeclarations;
  /// Déclarations d'autres membres que ma fonction me permet de confirmer
  /// ou contrôler dans ce groupe (0 sans fonction).
  final int toValidate;
  final List<PendingVote> votes;
  final DateTime? nextMeetingDate;
  final String? nextMeetingPlace;
  /// Dernières notifications de CE groupe.
  final List<KombeNotification> recent;

  /// Tous les tours du cycle (tableau de bord interactif).
  final List<RoundProgress> rounds;

  /// Votes libres ouverts auxquels je n'ai pas encore répondu (0041).
  final int openPolls;
  final bool nextMeetingOnline;

  int get remainingXaf => dues.fold<int>(0, (int s, OpenDue d) => s + d.remainingXaf);
  bool get late => dues.any((OpenDue d) => d.late);
}
