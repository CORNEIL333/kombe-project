/// Un « nom » du cycle (0041) : une part à part entière.
final class ShareName {
  const ShareName({required this.shareId, required this.label, required this.holders, required this.contributionXaf, required this.canRename, this.roundSeq, this.roundDate});
  final String shareId;
  final String label;
  final List<String> holders;
  final int contributionXaf;
  final bool canRename;
  final int? roundSeq;
  final DateTime? roundDate;
}
