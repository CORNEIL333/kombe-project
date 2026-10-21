enum NotificationKind { contribution, validation, meeting, vote, dispute, security, system }

/// Notification de l'application (`NotificationView` serveur) : titre selon le
/// type, ligne de détail construite à partir des paramètres (échéance, tour,
/// nom…), et cible à ouvrir au toucher.
final class KombeNotification {
  const KombeNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAtUtc,
    required this.read,
    this.code = 'general',
    this.groupId,
    this.groupName,
    this.target,
    this.params = const <String, Object?>{},
  });

  final String id;
  final NotificationKind kind;
  final String title;

  /// Ligne de détail lisible (groupe, échéance, nom…).
  final String body;
  final DateTime createdAtUtc;
  final bool read;

  /// Type serveur brut (`statutes_published`, `due_reminder`…).
  final String code;
  final String? groupId;
  final String? groupName;

  /// Cible serveur (`/tontines/<groupe>/<section>[/<id>]`), voir
  /// `notificationRoute`.
  final String? target;
  final Map<String, Object?> params;

  KombeNotification copyWith({bool? read}) => KombeNotification(
        id: id,
        kind: kind,
        title: title,
        body: body,
        createdAtUtc: createdAtUtc,
        read: read ?? this.read,
        code: code,
        groupId: groupId,
        groupName: groupName,
        target: target,
        params: params,
      );
}

/// Route de l'application à ouvrir pour une notification : la cible serveur
/// `/tontines/<g>/<section>[/<id>]` est traduite vers les écrans existants
/// (`/app/groups/:groupId/{cycle,members,rules,funds}`, le détail du groupe
/// sinon ; « mes amendes » pour une amende qui me concerne). `null` quand il
/// n'y a rien à ouvrir.
String? notificationRoute({String? target, String? groupId, String? code}) {
  // Demande refusée, exclusion : le groupe n'est plus lisible pour moi.
  if (code == 'rejected' || code == 'statutes_excluded') return null;
  final List<String> parts = (target ?? '').split('/').where((String s) => s.isNotEmpty).toList();
  String? gid = groupId;
  String? section;
  if (parts.length >= 2 && parts.first == 'tontines') {
    gid = parts[1];
    if (parts.length >= 3) section = parts[2];
  }
  if (gid == null || gid.isEmpty) return null;
  final String base = '/app/groups/${Uri.encodeComponent(gid)}';
  return switch (section) {
    'membres' || 'members' => '$base/members',
    'statuts' || 'rules' || 'statutes' => '$base/rules',
    'calendrier' || 'cycle' => '$base/cycle',
    'argent' || 'caisses' || 'funds' => '$base/funds',
    'decisions' || 'votes' => '/app/votes',
    'discipline' when code == 'fine_issued' || code == 'fine_cancelled' => '/app/fines',
    _ => base,
  };
}
