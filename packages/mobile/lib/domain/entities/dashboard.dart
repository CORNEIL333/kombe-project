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

  int get remainingXaf => dues.fold<int>(0, (int s, OpenDue d) => s + d.remainingXaf);
  bool get late => dues.any((OpenDue d) => d.late);
}
