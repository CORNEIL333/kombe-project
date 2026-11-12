import '../../core/formatters/douala_time.dart';
import '../../core/formatters/labels.dart';
import '../../core/formatters/xaf.dart';
import '../../domain/entities/notification.dart';
import '../../features/notifications/notification_catalog.dart';
import '../../l10n/kombe_l10n.dart';

// ── Notifications de l'API tontine (NotificationView) ────────────────────
// Le serveur envoie un type (`kind`), une cible (`target`) et des paramètres
// lisibles (`params` : nom du groupe, échéance, n° de tour, nom…). Le titre
// dépend du type ; la ligne de détail est construite à partir des paramètres.

Map<String, String> get _decisionKinds => <String, String>{
  'pause': KombeL10n.current.ntPauseDesSeances,
  'removal': KombeL10n.current.ntDestitution,
  'exclusion': KombeL10n.current.ntExclusion,
  'payout_suspension': KombeL10n.current.ntSuspensionDuDroitDeBouffer,
  'replacement': KombeL10n.current.ntRepriseDePlace,
};

String _s(Object? v) => v == null ? '' : '$v'.trim();

String _dueStage(String stage) => switch (stage) {
      'j2' => KombeL10n.current.ntCotisationVerserDansJours,
      'j1' => KombeL10n.current.ntCotisationVerserDemain,
      'j0' => KombeL10n.current.ntCotisationVerserAujourdhui,
      'late' => KombeL10n.current.ntCotisationEnRetard,
      'grace' => KombeL10n.current.ntCotisationEnRetardDelaiDe,
      _ => KombeL10n.current.ntCotisationVerser,
    };

String _meetingStage(String stage) => switch (stage) {
      'j1' => KombeL10n.current.ntSeanceDemain,
      'j0' => KombeL10n.current.ntSeanceAujourdhui,
      _ => KombeL10n.current.ntSeanceVenir,
    };

/// Catégorie (icône) et titre selon le type serveur.
({NotificationKind kind, String title}) notificationLabel(String code, Map<String, Object?> p) => switch (code) {
      'join_request' => (kind: NotificationKind.system, title: KombeL10n.current.ntNouvelleDemandeDadhesion),
      'admitted' => (kind: NotificationKind.system, title: KombeL10n.current.ntVousEtesAdmisDansLe),
      'rejected' => (kind: NotificationKind.system, title: KombeL10n.current.ntVotreDemandeDadhesionNaPas),
      'membership' => (kind: NotificationKind.system, title: KombeL10n.current.ntDuNouveauSurVotreAdhesion),
      'role_proposed' => (kind: NotificationKind.system, title: KombeL10n.current.ntUneFonctionVousEstProposee),
      'role_reminder' => (kind: NotificationKind.system, title: KombeL10n.current.ntUneFonctionAttendVotreReponse),
      'statutes_published' => (kind: NotificationKind.vote, title: KombeL10n.current.ntNouveauxStatutsAccepter),
      'statutes_reminder' => (
          kind: NotificationKind.vote,
          title: _s(p['stage']) == 'nouvelle_echeance' ? KombeL10n.current.ntStatutsNouvelleEcheance : KombeL10n.current.ntRappelStatutsAccepter,
        ),
      'statutes_excluded' => (kind: NotificationKind.vote, title: KombeL10n.current.ntVousAvezEteRetireDu),
      'statutes_expired' => (kind: NotificationKind.vote, title: KombeL10n.current.ntEcheanceDesStatutsPassee),
      'cycle_started' => (kind: NotificationKind.meeting, title: KombeL10n.current.ntLeCycleDemarre),
      'meeting_opened' => (kind: NotificationKind.meeting, title: KombeL10n.current.ntLaSeanceEstOuverte),
      'meeting_reminder' => (kind: NotificationKind.meeting, title: _meetingStage(_s(p['stage']))),
      'minutes_ready' => (kind: NotificationKind.meeting, title: KombeL10n.current.ntProcesVerbalDisponible),
      'draw_committed' => (kind: NotificationKind.meeting, title: KombeL10n.current.ntTirageAuSortScelle),
      'order_change' => (kind: NotificationKind.meeting, title: KombeL10n.current.ntChangementDansLordreDesTours),
      'due_reminder' => (kind: NotificationKind.contribution, title: _dueStage(_s(p['stage']))),
      'validation_waiting' => (kind: NotificationKind.validation, title: KombeL10n.current.ntDesVersementsAttendentVotreControle),
      'movement_rejected' => (kind: NotificationKind.validation, title: KombeL10n.current.ntUnVersementEteRejete),
      'payout_to_confirm' => (kind: NotificationKind.contribution, title: KombeL10n.current.ntConfirmezLaReceptionDeVotre),
      'payout_recorded' => (kind: NotificationKind.contribution, title: KombeL10n.current.ntRemiseEnregistree),
      'fund_created' => (kind: NotificationKind.contribution, title: KombeL10n.current.fuNouvelleCaisse),
      'fine_issued' => (kind: NotificationKind.dispute, title: KombeL10n.current.ntUneAmendeVousEteNotifiee),
      'fine_cancelled' => (kind: NotificationKind.dispute, title: KombeL10n.current.ntAmendeAnnulee),
      'fine_contested' => (kind: NotificationKind.dispute, title: KombeL10n.current.ntUneAmendeEstContestee),
      'support_reply' => (kind: NotificationKind.system, title: KombeL10n.current.ntLeSupportKombeVousRepondu),
      'support_request' => (kind: NotificationKind.system, title: KombeL10n.current.ntDemandeDassistanceTraiter),
      'support_sla' => (kind: NotificationKind.system, title: KombeL10n.current.ntDelaiDeServiceEcheanceProche),
      'fine_refunded' => (kind: NotificationKind.dispute, title: KombeL10n.current.ntRemboursementAmendeEnregistre),
      'poll_opened' => (kind: NotificationKind.vote, title: KombeL10n.current.ntNouveauVoteOuvert),
      'meeting_updated' => (kind: NotificationKind.system, title: KombeL10n.current.ntSeanceModifiee),
      'aid_requested' => (kind: NotificationKind.system, title: KombeL10n.current.ntDemandeDeSecoursExaminer),
      'aid_decided' => (kind: NotificationKind.system, title: KombeL10n.current.ntDecisionSurUneDemandeDe),
      'decision' => (kind: NotificationKind.vote, title: KombeL10n.current.voVoteOuvert),
      'vote_reminder' => (kind: NotificationKind.vote, title: KombeL10n.current.ntVoteDernierDelai),
      _ => (kind: NotificationKind.system, title: _unknownTitle),
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
      if (name.isNotEmpty) parts.add(KombeL10n.current.ntDemandeRejoindre(name));
    case 'role_proposed' || 'role_reminder':
      if (role.isNotEmpty) parts.add(apiRoleLabel(role));
    case 'statutes_published' || 'statutes_reminder':
      if (deadline.isNotEmpty) parts.add(KombeL10n.current.ntAccepterAvantLe(DoualaTime.dateTime(deadline)));
      if (_s(p['onExpiry']) == 'exclude') parts.add(KombeL10n.current.ntSinonExclusionAvantLeDemarrage);
    case 'statutes_expired':
      if (name.isNotEmpty) {
        parts.add(p['excluded'] == true ? KombeL10n.current.ntRetireDuGroupe(name) : KombeL10n.current.ntNaPasAccepte(name));
      }
    case 'due_reminder':
      if (round.isNotEmpty) parts.add(KombeL10n.current.ntTour(round));
      final int? left = int.tryParse(_s(p['remaining']));
      if (left != null && left > 0) parts.add(KombeL10n.current.ntRestants(Xaf.format(left)));
      if (date.isNotEmpty) {
        final String time = _s(p['deadlineTime']);
        parts.add(time.isEmpty ? KombeL10n.current.ntBeforeDate(DoualaTime.date(date)) : KombeL10n.current.ntBeforeDateAt(DoualaTime.date(date), time));
      }
    case 'meeting_reminder' || 'meeting_opened' || 'minutes_ready':
      if (date.isNotEmpty) parts.add(DoualaTime.date(date));
      final String place = _s(p['place']);
      if (place.isNotEmpty) parts.add(place);
    case 'cycle_started':
      final String first = _s(p['firstDate']);
      if (first.isNotEmpty) parts.add(KombeL10n.current.ntPremiereSeanceLe(DoualaTime.date(first)));
      final String rounds = _s(p['rounds']);
      if (rounds.isNotEmpty) parts.add(KombeL10n.current.ntTours(rounds));
    case 'payout_to_confirm' || 'payout_recorded':
      if (round.isNotEmpty) parts.add(KombeL10n.current.ntTour(round));
      final int? amount = int.tryParse(_s(p['amount']));
      if (amount != null && amount > 0) parts.add(Xaf.format(amount));
    case 'decision' || 'vote_reminder':
      final String kind = _s(p['decisionKind']);
      if (kind.isNotEmpty) parts.add(_decisionKinds[kind] ?? kind);
      final String closes = _s(p['closesAt']);
      if (closes.isNotEmpty) parts.add(KombeL10n.current.ntClotureLe(DoualaTime.dateTime(closes)));
    default:
      if (name.isNotEmpty) parts.add(name);
      if (round.isNotEmpty) parts.add(KombeL10n.current.ntTour(round));
      if (date.isNotEmpty) parts.add(DoualaTime.date(date));
      if (deadline.isNotEmpty) parts.add(KombeL10n.current.ntAvantLe(DoualaTime.dateTime(deadline)));
  }
  return parts.join(' · ');
}

DateTime _instant(Object? v) => DateTime.tryParse('${v ?? ''}')?.toUtc() ?? DateTime.now().toUtc();

/// Types serveur génériques : la nature précise (`topic`) dit mieux de quoi
/// il s'agit (déclaration à confirmer ou paiements à contrôler, vote ouvert
/// ou clos…).
const Set<String> _topicFirstCodes = <String>{'general', 'validation_waiting', 'decision', 'membership'};

/// Titre : le type précis du serveur, sinon la nature (`topic`), sinon la
/// catégorie générale.
({NotificationKind kind, String title}) _labelFor(String code, String topic, Map<String, Object?> p) {
  final NotificationEntry? byTopic = notificationCatalog[topic];
  if (byTopic != null && _topicFirstCodes.contains(code)) return (kind: byTopic.kind, title: byTopic.title);
  final ({NotificationKind kind, String title}) byCode = notificationLabel(code, p);
  if (byCode.title != _unknownTitle) return byCode;
  final NotificationEntry fallback = entryFor(topic, code);
  return (kind: fallback.kind, title: fallback.title);
}

final String _unknownTitle = KombeL10n.current.ntInformationDuGroupe;

/// `NotificationView` → [KombeNotification] : rien n'est jeté (groupe,
/// cible, paramètres, nature, objet) ; titre et détail lisibles.
KombeNotification notificationFromApi(Map<String, dynamic> n) {
  final String code = _s(n['kind']).isEmpty ? 'general' : _s(n['kind']);
  final String topic = _s(n['topic']);
  final Map<String, Object?> params = <String, Object?>{
    ...?(n['params'] as Map<String, dynamic>?),
  };
  final String? groupName = (n['groupName'] as String?) ?? (params['groupName'] as String?);
  final ({NotificationKind kind, String title}) label = _labelFor(code, topic, params);
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
    topic: topic,
    subjectId: n['subjectId'] as String?,
  );
}
