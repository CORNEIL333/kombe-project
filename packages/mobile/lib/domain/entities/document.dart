enum DocumentKind { statement, cycleReport, export, rules, dispute, other }

final class KombeDocument {
  const KombeDocument({
    required this.id,
    required this.kind,
    required this.title,
    required this.createdAtUtc,
    required this.downloadUri,
  });

  final String id;
  final DocumentKind kind;
  final String title;
  final DateTime createdAtUtc;
  final Uri downloadUri;
}
