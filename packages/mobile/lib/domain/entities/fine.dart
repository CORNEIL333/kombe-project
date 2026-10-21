/// Amende notifiée à la personne connectée (`GET /v1/tontines/:id/fines`,
/// filtrée sur son adhésion). Elle se paie hors de KÓMBE ; ici on la consulte
/// et, si elle semble injuste, on la conteste avec un motif : la présidence
/// tranche ensuite (annulation ou maintien).
enum FineState { issued, contested, paid, cancelled }

FineState fineStateFrom(Object? v) => switch ('$v') {
      'contested' => FineState.contested,
      'paid' => FineState.paid,
      'cancelled' => FineState.cancelled,
      _ => FineState.issued,
    };

String fineStateLabel(FineState s) => switch (s) {
      FineState.issued => 'À régler',
      FineState.contested => 'Contestée — en attente de la présidence',
      FineState.paid => 'Réglée',
      FineState.cancelled => 'Annulée',
    };

String fineKindLabel(String kind) => switch (kind) {
      'late_contribution' => 'Retard de cotisation',
      'meeting_late' => 'Retard à la séance',
      'meeting_absence' => 'Absence non excusée',
      'indiscipline' => 'Indiscipline',
      _ => 'Amende',
    };

final class MyFine {
  const MyFine({
    required this.fineId,
    required this.groupId,
    required this.groupName,
    required this.kind,
    required this.amountXaf,
    required this.reason,
    required this.state,
    required this.issuedAtUtc,
    this.issuedByName,
  });

  final String fineId;
  final String groupId;
  final String groupName;

  /// Code du type d'amende (`late_contribution`…), voir [fineKindLabel].
  final String kind;
  final int amountXaf;
  final String reason;
  final FineState state;
  final DateTime issuedAtUtc;
  final String? issuedByName;

  /// Seule une amende « à régler » se conteste.
  bool get contestable => state == FineState.issued;
}
