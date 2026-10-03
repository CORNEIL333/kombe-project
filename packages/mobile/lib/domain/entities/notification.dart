enum NotificationKind { contribution, validation, meeting, vote, dispute, security, system }

final class KombeNotification {
  const KombeNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAtUtc,
    required this.read,
  });

  final String id;
  final NotificationKind kind;
  final String title;
  final String body;
  final DateTime createdAtUtc;
  final bool read;
}
