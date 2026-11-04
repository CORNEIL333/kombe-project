/// Moyens de paiement réels au Cameroun. `mobileMoney` (opérateur non précisé)
/// reste lisible pour les brouillons anciens et part comme « autre ».
enum PaymentChannel { orangeMoney, mtnMomo, mobileMoney, bankTransfer, internationalTransfer, cash }

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
    required this.status,
    this.channel,
    this.declaredAtUtc,
    this.note,
    this.evidenceName,
  });

  final String id;
  final String groupId;
  final String obligationId;
  final int amountXaf;
  /// null quand le contrat de lecture (`Contribution`) ne rend pas le canal —
  /// la lecture ne l'invente jamais (ADR-0020, carte d'intégration API).
  final PaymentChannel? channel;
  final ContributionStatus status;
  /// Date d'enregistrement ; null si l'endpoint ne la rend pas — l'horodatage
  /// fait foi côté serveur (règle 18 / ADR-0005), le client ne la fabrique pas.
  final DateTime? declaredAtUtc;
  final String? note;
  final String? evidenceName;
}

/// Une échéance ouverte d'une caisse pour un tour (`GET /me/dues`).
final class OpenDue {
  const OpenDue({
    required this.fundId,
    required this.fundName,
    required this.fundKind,
    required this.roundSeq,
    required this.remainingXaf,
    required this.late,
  });

  final String fundId;
  final String fundName;
  final String fundKind;
  final int roundSeq;
  final int remainingXaf;
  final bool late;
}

/// Une écriture prévue d'une déclaration : une caisse, un tour, un montant.
/// `movementId` est posé dès que le serveur a enregistré la ligne.
final class DeclarationLine {
  const DeclarationLine({
    required this.fundId,
    required this.fundName,
    required this.roundSeq,
    required this.amountXaf,
    this.movementId,
  });

  final String fundId;
  final String fundName;
  final int roundSeq;
  final int amountXaf;
  final String? movementId;

  bool get recorded => movementId != null;

  DeclarationLine recordedAs(String id) =>
      DeclarationLine(fundId: fundId, fundName: fundName, roundSeq: roundSeq, amountXaf: amountXaf, movementId: id);

  Map<String, Object?> toJson() => <String, Object?>{
        'fundId': fundId,
        'fundName': fundName,
        'roundSeq': roundSeq,
        'amountXaf': amountXaf,
        'movementId': movementId,
      };

  static DeclarationLine fromJson(Map<String, dynamic> j) => DeclarationLine(
        fundId: '${j['fundId']}',
        fundName: '${j['fundName'] ?? ''}',
        roundSeq: (j['roundSeq'] as num).toInt(),
        amountXaf: (j['amountXaf'] as num).toInt(),
        movementId: j['movementId'] as String?,
      );
}

/// Montant supérieur à ce qui reste dû : KÓMBE ne déclare jamais un
/// excédent en silence.
final class AmountExceedsDue implements Exception {
  const AmountExceedsDue(this.maxXaf);
  final int maxXaf;
}

/// Répartit un montant sur les échéances ouvertes : le plus ancien tour
/// d'abord, la cagnotte (rotation) avant les autres caisses du même tour —
/// comme on paie en séance. Pur et déterministe : la même entrée donne
/// toujours le même plan.
List<DeclarationLine> planDeclaration(List<OpenDue> dues, int amountXaf) {
  final List<OpenDue> open = dues.where((OpenDue d) => d.remainingXaf > 0).toList()
    ..sort((OpenDue a, OpenDue b) {
      final int byRound = a.roundSeq.compareTo(b.roundSeq);
      if (byRound != 0) return byRound;
      return (a.fundKind == 'rotation' ? 0 : 1).compareTo(b.fundKind == 'rotation' ? 0 : 1);
    });
  final int max = open.fold<int>(0, (int s, OpenDue d) => s + d.remainingXaf);
  if (amountXaf > max) throw AmountExceedsDue(max);
  final List<DeclarationLine> lines = <DeclarationLine>[];
  int left = amountXaf;
  for (final OpenDue d in open) {
    if (left <= 0) break;
    final int part = left < d.remainingXaf ? left : d.remainingXaf;
    lines.add(DeclarationLine(fundId: d.fundId, fundName: d.fundName, roundSeq: d.roundSeq, amountXaf: part));
    left -= part;
  }
  return lines;
}

/// Issue réelle d'un envoi : lignes enregistrées, et si l'envoi s'est arrêté,
/// pourquoi. `outcomeUnknown` : la réponse s'est perdue (réseau) — la ligne
/// a peut-être été enregistrée ; reprendre rejoue la même clé, sans doublon.
final class DeclarationReceipt {
  const DeclarationReceipt({required this.lines, this.error, this.outcomeUnknown = false});

  final List<DeclarationLine> lines;
  final Object? error;
  final bool outcomeUnknown;

  int get recordedCount => lines.where((DeclarationLine l) => l.recorded).length;
  bool get complete => lines.isNotEmpty && recordedCount == lines.length;
  bool get partial => recordedCount > 0 && !complete;
}

/// Brouillon local d'une déclaration. Une référence de transaction est
/// exigée hors espèces ; à défaut, un motif (règle serveur
/// `REFERENCE_JUSTIFICATION_REQUIRED`). `plan` est figé au premier envoi :
/// une reprise renvoie exactement les mêmes lignes avec les mêmes clés.
final class ContributionDraft {
  const ContributionDraft({
    required this.localId,
    required this.groupId,
    required this.amountXaf,
    required this.channel,
    required this.updatedAtUtc,
    this.reference,
    this.noReferenceReason,
    this.plan = const <DeclarationLine>[],
  });

  final String localId;
  final String groupId;
  final int amountXaf;
  final PaymentChannel channel;
  final DateTime updatedAtUtc;
  final String? reference;
  final String? noReferenceReason;
  final List<DeclarationLine> plan;

  bool get sending => plan.isNotEmpty;

  ContributionDraft copyWith({
    int? amountXaf,
    PaymentChannel? channel,
    String? reference,
    String? noReferenceReason,
    List<DeclarationLine>? plan,
    bool clearReference = false,
    bool clearReason = false,
  }) =>
      ContributionDraft(
        localId: localId,
        groupId: groupId,
        amountXaf: amountXaf ?? this.amountXaf,
        channel: channel ?? this.channel,
        updatedAtUtc: DateTime.now().toUtc(),
        reference: clearReference ? null : (reference ?? this.reference),
        noReferenceReason: clearReason ? null : (noReferenceReason ?? this.noReferenceReason),
        plan: plan ?? this.plan,
      );
}

/// Référence acceptée par le serveur (lettres, chiffres, . - _ / espace).
bool isValidTransactionReference(String value) =>
    RegExp(r'^[A-Za-z0-9.\-_/ ]{1,64}$').hasMatch(value.trim());
