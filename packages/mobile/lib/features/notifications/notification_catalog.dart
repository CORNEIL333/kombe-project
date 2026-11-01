import '../../domain/entities/notification.dart';

/// Où mène une notification. `web` : la fonction n'existe que dans KÓMBE Web
/// (PWA) — l'ouverture est annoncée comme telle, jamais déguisée.
sealed class NotificationDestination {
  const NotificationDestination();
}

final class InAppDestination extends NotificationDestination {
  const InAppDestination(this.route);
  final String route;
}

final class WebDestination extends NotificationDestination {
  const WebDestination(this.fragment, this.label);
  final String fragment;
  final String label;
}

final class NoDestination extends NotificationDestination {
  const NoDestination();
}

/// Libellé et destination par nature (`topic`) — même vocabulaire que la PWA
/// (`packages/client/src/tontine/notifications.ts`). Le serveur re-vérifie
/// les droits à l'ouverture : une destination n'accorde rien.
final class NotificationEntry {
  const NotificationEntry(this.kind, this.title);
  final NotificationKind kind;
  final String title;
}

const Map<String, NotificationEntry> notificationCatalog = <String, NotificationEntry>{
  'declared': NotificationEntry(NotificationKind.validation, 'Une déclaration attend votre confirmation'),
  'toControl': NotificationEntry(NotificationKind.validation, 'Des paiements confirmés attendent votre contrôle'),
  'rejected': NotificationEntry(NotificationKind.contribution, 'Une déclaration a été rejetée'),
  'due': NotificationEntry(NotificationKind.contribution, 'Une cotisation arrive à échéance'),
  'payout': NotificationEntry(NotificationKind.contribution, 'Remise enregistrée : confirmez la réception'),
  'received': NotificationEntry(NotificationKind.contribution, 'Réception de la remise confirmée'),
  'reserve': NotificationEntry(NotificationKind.contribution, 'Réserve de fin d’année distribuée'),
  'fund': NotificationEntry(NotificationKind.system, 'Nouvelle caisse dans le groupe'),
  'decision': NotificationEntry(NotificationKind.vote, 'Un vote est ouvert'),
  'decision-closed': NotificationEntry(NotificationKind.vote, 'Résultat d’un vote'),
  'decision-lifted': NotificationEntry(NotificationKind.vote, 'Une sanction a été levée'),
  'fine': NotificationEntry(NotificationKind.dispute, 'Une amende vous a été notifiée'),
  'fineDecision': NotificationEntry(NotificationKind.dispute, 'Décision sur votre contestation d’amende'),
  'contest': NotificationEntry(NotificationKind.dispute, 'Une amende est contestée'),
  'aid': NotificationEntry(NotificationKind.validation, 'Une demande de secours est à examiner'),
  'aidDecision': NotificationEntry(NotificationKind.system, 'Décision sur votre demande de secours'),
  'aidPaid': NotificationEntry(NotificationKind.contribution, 'Secours versé'),
  'meetingSoon': NotificationEntry(NotificationKind.meeting, 'Séance dans les prochains jours'),
  'minutes': NotificationEntry(NotificationKind.meeting, 'Procès-verbal disponible'),
  'statutes': NotificationEntry(NotificationKind.system, 'Nouveaux statuts à lire et accepter'),
  'admission': NotificationEntry(NotificationKind.system, 'Votre adhésion est acceptée'),
  'join': NotificationEntry(NotificationKind.system, 'Nouvelle demande d’adhésion'),
  'role': NotificationEntry(NotificationKind.system, 'Une fonction vous a été confiée'),
  'cycle': NotificationEntry(NotificationKind.system, 'Un nouveau cycle commence'),
  'draw': NotificationEntry(NotificationKind.vote, 'Ordre des tours tiré au sort'),
  'swap': NotificationEntry(NotificationKind.vote, 'Demande d’échange de tour'),
  'swap-ready': NotificationEntry(NotificationKind.vote, 'Échange de tour à approuver'),
  'swap-applied': NotificationEntry(NotificationKind.vote, 'Échange de tour appliqué'),
};

/// Repli par catégorie serveur (anciennes notifications sans topic).
NotificationEntry entryFor(String topic, String kind) =>
    notificationCatalog[topic] ??
    switch (kind) {
      'due_reminder' => const NotificationEntry(NotificationKind.contribution, 'Une cotisation arrive à échéance'),
      'meeting_reminder' => const NotificationEntry(NotificationKind.meeting, 'Séance dans les prochains jours'),
      'validation_waiting' => const NotificationEntry(NotificationKind.validation, 'Une validation vous attend'),
      'payout_recorded' => const NotificationEntry(NotificationKind.contribution, 'Remise enregistrée'),
      'fine_issued' => const NotificationEntry(NotificationKind.dispute, 'Amende'),
      'aid_decided' => const NotificationEntry(NotificationKind.system, 'Décision sur une demande de secours'),
      'order_change' => const NotificationEntry(NotificationKind.vote, 'Ordre des tours'),
      'membership' => const NotificationEntry(NotificationKind.system, 'Membres du groupe'),
      'minutes_ready' => const NotificationEntry(NotificationKind.meeting, 'Procès-verbal disponible'),
      'decision' => const NotificationEntry(NotificationKind.vote, 'Vote de l’association'),
      _ => const NotificationEntry(NotificationKind.system, 'Nouveauté dans votre groupe'),
    };

/// Destination contrôlée : toujours dans le bon groupe.
NotificationDestination destinationFor(KombeNotification n) {
  final String? g = n.groupId;
  if (g == null) return const NoDestination();
  final String gid = Uri.encodeComponent(g);
  final String? s = n.subjectId == null ? null : Uri.encodeComponent(n.subjectId!);
  return switch (n.topic) {
    'declared' when s != null => InAppDestination('/app/validations/$s'),
    'declared' || 'toControl' => const InAppDestination('/app/validations'),
    'rejected' => const InAppDestination('/app/contributions'),
    'due' => InAppDestination('/app/groups/$gid/contributions/new'),
    'payout' || 'received' || 'reserve' => WebDestination('/groupe/$gid/argent', 'Ouvrir la trésorerie dans KÓMBE Web'),
    'fund' => InAppDestination('/app/groups/$gid/funds'),
    'decision' || 'decision-closed' when s != null => InAppDestination('/app/votes/$s'),
    'decision' || 'decision-closed' || 'decision-lifted' => const InAppDestination('/app/votes'),
    'fine' || 'fineDecision' || 'contest' => WebDestination('/groupe/$gid/discipline', 'Ouvrir la discipline dans KÓMBE Web'),
    'aid' || 'aidDecision' || 'aidPaid' => WebDestination('/groupe/$gid/discipline', 'Ouvrir les secours dans KÓMBE Web'),
    'meetingSoon' || 'minutes' => WebDestination('/groupe/$gid/seances', 'Ouvrir les séances dans KÓMBE Web'),
    'statutes' => InAppDestination('/app/groups/$gid/rules'),
    'join' || 'role' => InAppDestination('/app/groups/$gid/members'),
    'cycle' || 'draw' || 'swap' || 'swap-ready' || 'swap-applied' => InAppDestination('/app/groups/$gid/cycle'),
    _ => InAppDestination('/app/groups/$gid'),
  };
}
