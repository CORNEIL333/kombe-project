enum NotificationKind { contribution, validation, meeting, vote, dispute, security, system }

/// Notification interne (boîte de réception du serveur). `topic` et
/// `subjectId` disent précisément de quoi il s'agit ; `groupId` borne la
/// destination. Ouvrir une notification ne décide jamais rien à la place
/// de la personne : elle mène à l'écran où l'action se fait.
final class KombeNotification {
  const KombeNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAtUtc,
    required this.read,
    this.groupId,
    this.topic = '',
    this.subjectId,
  });

  final String id;
  final NotificationKind kind;
  final String title;
  /// Nom du groupe concerné.
  final String body;
  final DateTime createdAtUtc;
  final bool read;
  final String? groupId;
  final String topic;
  final String? subjectId;

  KombeNotification markedRead() => KombeNotification(
        id: id,
        kind: kind,
        title: title,
        body: body,
        createdAtUtc: createdAtUtc,
        read: true,
        groupId: groupId,
        topic: topic,
        subjectId: subjectId,
      );
}
