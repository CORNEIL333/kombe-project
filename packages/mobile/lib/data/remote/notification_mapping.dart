import '../../core/formatters/douala_time.dart';
import '../../core/formatters/xaf.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';

// ── Notifications de l'API tontine (NotificationView) ────────────────────
// Le serveur envoie un type (`kind`), une cible (`target`) et des paramètres
// lisibles (`params` : nom du groupe, échéance, n° de tour, nom…). Le titre
// dépend du type ; la ligne de détail est construite à partir des paramètres.

const Map<String, String> _decisionKinds = <String, String>{
  'pause': 'Pause des séances',
  'removal': 'Destitution',
  'exclusion': 'Exclusion',
  'payout_suspension': 'Suspension du droit de bouffer',
  'replacement': 'Reprise de place',
};

String _s(Object? v) => v == null ? '' : '$v'.trim();

String _dueStage(String stage) => switch (stage) {
      'j2' => 'Cotisation à verser dans 2 jours',
      'j1' => 'Cotisation à verser demain',
      'j0' => 'Cotisation à verser aujourd’hui',
      'late' => 'Cotisation en retard',
      'grace' => 'Cotisation en retard (délai de grâce)',
      _ => 'Cotisation à verser',
    };

String _meetingStage(String stage) => switch (stage) {
      'j1' => 'Séance demain',
      'j0' => 'Séance aujourd’hui',
      _ => 'Séance à venir',
    };

/// Catégorie (icône) et titre selon le type serveur.
({NotificationKind kind, String title}) notificationLabel(String code, Map<String, Object?> p) => switch (code) {
      'join_request' => (kind: NotificationKind.system, title: 'Nouvelle demande d’adhésion'),
      'admitted' => (kind: NotificationKind.system, title: 'Vous êtes admis dans le groupe'),
      'rejected' => (kind: NotificationKind.system, title: 'Votre demande d’adhésion n’a pas été retenue'),
      'membership' => (kind: NotificationKind.system, title: 'Du nouveau sur votre adhésion'),
      'role_proposed' => (kind: NotificationKind.system, title: 'Une fonction vous est proposée'),
      'role_reminder' => (kind: NotificationKind.system, title: 'Une fonction attend votre réponse'),
      'statutes_published' => (kind: NotificationKind.vote, title: 'Nouveaux statuts à accepter'),
      'statutes_reminder' => (
          kind: NotificationKind.vote,
          title: _s(p['stage']) == 'nouvelle_echeance' ? 'Statuts : nouvelle échéance' : 'Rappel : statuts à accepter',
        ),
      'statutes_excluded' => (kind: NotificationKind.vote, title: 'Vous avez été retiré du groupe (statuts non acceptés)'),
      'statutes_expired' => (kind: NotificationKind.vote, title: 'Échéance des statuts passée'),
      'cycle_started' => (kind: NotificationKind.meeting, title: 'Le cycle a démarré'),
      'meeting_opened' => (kind: NotificationKind.meeting, title: 'La séance est ouverte'),
      'meeting_reminder' => (kind: NotificationKind.meeting, title: _meetingStage(_s(p['stage']))),
      'minutes_ready' => (kind: NotificationKind.meeting, title: 'Procès-verbal disponible'),
      'draw_committed' => (kind: NotificationKind.meeting, title: 'Tirage au sort scellé'),
      'order_change' => (kind: NotificationKind.meeting, title: 'Changement dans l’ordre des tours'),
      'due_reminder' => (kind: NotificationKind.contribution, title: _dueStage(_s(p['stage']))),
      'validation_waiting' => (kind: NotificationKind.validation, title: 'Des versements attendent votre contrôle'),
      'movement_rejected' => (kind: NotificationKind.validation, title: 'Un versement a été rejeté'),
      'payout_to_confirm' => (kind: NotificationKind.contribution, title: 'Confirmez la réception de votre remise'),
      'payout_recorded' => (kind: NotificationKind.contribution, title: 'Remise enregistrée'),
      'fund_created' => (kind: NotificationKind.contribution, title: 'Nouvelle caisse'),
      'fine_issued' => (kind: NotificationKind.dispute, title: 'Une amende vous a été notifiée'),
      'fine_cancelled' => (kind: NotificationKind.dispute, title: 'Amende annulée'),
      'fine_contested' => (kind: NotificationKind.dispute, title: 'Une amende est contestée'),
      'aid_requested' => (kind: NotificationKind.system, title: 'Demande de secours à examiner'),
      'aid_decided' => (kind: NotificationKind.system, title: 'Décision sur une demande de secours'),
      'decision' => (kind: NotificationKind.vote, title: 'Vote ouvert'),
      'vote_reminder' => (kind: NotificationKind.vote, title: 'Vote : dernier délai'),
      _ => (kind: NotificationKind.system, title: 'Information du groupe'),
    };

/// Ligne de détail : nom du groupe puis les paramètres utiles au type.
String notificationDetail(String code, Map<String, Object?> p, String? groupName) {
  final List<String> parts = <String>[];
  final String group = _s(groupName).isNotEmpty ? _s(groupName) : _s(p['groupName']);
  if (group.isNotEmpty) parts.add(group);
  final String name = _s(p['name']);
  final String role = _s(p['role']);
  final String deadline = _s(p['deadlineAt']);
  final String round = _s(p['roundSeq']);
  final String date = _s(p['date']);
  switch (code) {
    case 'join_request':
      if (name.isNotEmpty) parts.add('$name demande à rejoindre');
    case 'role_proposed' || 'role_reminder':
      if (role.isNotEmpty) parts.add(apiRoleLabel(role));
    case 'statutes_published' || 'statutes_reminder':
      if (deadline.isNotEmpty) parts.add('À accepter avant le ${DoualaTime.dateTime(deadline)}');
      if (_s(p['onExpiry']) == 'exclude') parts.add('sinon exclusion avant le démarrage du cycle');
    case 'statutes_expired':
      if (name.isNotEmpty) {
        parts.add(p['excluded'] == true ? '$name : retiré(e) du groupe' : '$name n’a pas accepté');
      }
    case 'due_reminder':
      if (round.isNotEmpty) parts.add('Tour $round');
      final int? left = int.tryParse(_s(p['remaining']));
      if (left != null && left > 0) parts.add('${Xaf.format(left)} restants');
      if (date.isNotEmpty) {
        final String time = _s(p['deadlineTime']);
        parts.add('avant le ${DoualaTime.date(date)}${time.isEmpty ? '' : ' à $time'}');
      }
    case 'meeting_reminder' || 'meeting_opened' || 'minutes_ready':
      if (date.isNotEmpty) parts.add(DoualaTime.date(date));
      final String place = _s(p['place']);
      if (place.isNotEmpty) parts.add(place);
    case 'cycle_started':
      final String first = _s(p['firstDate']);
      if (first.isNotEmpty) parts.add('Première séance le ${DoualaTime.date(first)}');
      final String rounds = _s(p['rounds']);
      if (rounds.isNotEmpty) parts.add('$rounds tours');
    case 'payout_to_confirm' || 'payout_recorded':
      if (round.isNotEmpty) parts.add('Tour $round');
      final int? amount = int.tryParse(_s(p['amount']));
      if (amount != null && amount > 0) parts.add(Xaf.format(amount));
    case 'decision' || 'vote_reminder':
      final String kind = _s(p['decisionKind']);
      if (kind.isNotEmpty) parts.add(_decisionKinds[kind] ?? kind);
      final String closes = _s(p['closesAt']);
      if (closes.isNotEmpty) parts.add('clôture le ${DoualaTime.dateTime(closes)}');
    default:
      if (name.isNotEmpty) parts.add(name);
      if (round.isNotEmpty) parts.add('Tour $round');
      if (date.isNotEmpty) parts.add(DoualaTime.date(date));
      if (deadline.isNotEmpty) parts.add('avant le ${DoualaTime.dateTime(deadline)}');
  }
  return parts.join(' · ');
}

DateTime _instant(Object? v) => DateTime.tryParse('${v ?? ''}')?.toUtc() ?? DateTime.now().toUtc();

/// `NotificationView` → [KombeNotification] : rien n'est jeté (groupe,
/// cible, paramètres) ; titre et détail lisibles.
KombeNotification notificationFromApi(Map<String, dynamic> n) {
  final String code = _s(n['kind']).isEmpty ? 'general' : _s(n['kind']);
  final Map<String, Object?> params = <String, Object?>{
    ...?(n['params'] as Map<String, dynamic>?),
  };
  final String? groupName = (n['groupName'] as String?) ?? (params['groupName'] as String?);
  final ({NotificationKind kind, String title}) label = notificationLabel(code, params);
  return KombeNotification(
    id: '${n['notificationId']}',
    kind: label.kind,
    title: label.title,
    body: notificationDetail(code, params, groupName),
    createdAtUtc: _instant(n['createdAt']),
    read: n['read'] == true,
    code: code,
    groupId: n['groupId'] as String?,
    groupName: groupName,
    target: n['target'] as String?,
    params: params,
  );
}
