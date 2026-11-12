import '../../domain/entities/notification.dart';
import '../../l10n/kombe_l10n.dart';

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

Map<String, NotificationEntry> get notificationCatalog => <String, NotificationEntry>{
  'declared': NotificationEntry(NotificationKind.validation, KombeL10n.current.ncUnPaiementAttendVotreConfirmation),
  'toControl': NotificationEntry(NotificationKind.validation, KombeL10n.current.ncDesPaiementsConfirmesAttendentVotre),
  'rejected': NotificationEntry(NotificationKind.contribution, KombeL10n.current.ncUnPaiementEteRejete),
  'due': NotificationEntry(NotificationKind.contribution, KombeL10n.current.ncUneCotisationArriveEcheance),
  'payout': NotificationEntry(NotificationKind.contribution, KombeL10n.current.ncRemiseEnregistreeConfirmezLaReception),
  'received': NotificationEntry(NotificationKind.contribution, KombeL10n.current.ncReceptionDeLaRemiseConfirmee),
  'reserve': NotificationEntry(NotificationKind.contribution, KombeL10n.current.ncReserveDeFinDanneeDistribuee),
  'fund': NotificationEntry(NotificationKind.system, KombeL10n.current.ncNouvelleCaisseDansLeGroupe),
  'decision': NotificationEntry(NotificationKind.vote, KombeL10n.current.ncUnVoteEstOuvert),
  'decision-closed': NotificationEntry(NotificationKind.vote, KombeL10n.current.ncResultatDunVote),
  'decision-lifted': NotificationEntry(NotificationKind.vote, KombeL10n.current.ncUneSanctionEteLevee),
  'fine': NotificationEntry(NotificationKind.dispute, KombeL10n.current.ntUneAmendeVousEteNotifiee),
  'fineDecision': NotificationEntry(NotificationKind.dispute, KombeL10n.current.ncDecisionSurVotreContestationDamende),
  'contest': NotificationEntry(NotificationKind.dispute, KombeL10n.current.ntUneAmendeEstContestee),
  'aid': NotificationEntry(NotificationKind.validation, KombeL10n.current.ncUneDemandeDeSecoursEst),
  'aidDecision': NotificationEntry(NotificationKind.system, KombeL10n.current.ncDecisionSurVotreDemandeDe),
  'aidPaid': NotificationEntry(NotificationKind.contribution, KombeL10n.current.ncSecoursVerse),
  'meetingSoon': NotificationEntry(NotificationKind.meeting, KombeL10n.current.ncSeanceDansLesProchainsJours),
  'minutes': NotificationEntry(NotificationKind.meeting, KombeL10n.current.ntProcesVerbalDisponible),
  'statutes': NotificationEntry(NotificationKind.system, KombeL10n.current.ncNouvellesReglesLireEtAccepter),
  'admission': NotificationEntry(NotificationKind.system, KombeL10n.current.ncVotreAdhesionEstAcceptee),
  'join': NotificationEntry(NotificationKind.system, KombeL10n.current.ntNouvelleDemandeDadhesion),
  'role': NotificationEntry(NotificationKind.system, KombeL10n.current.ncUneFonctionVousEteConfiee),
  'cycle': NotificationEntry(NotificationKind.system, KombeL10n.current.ncUnNouveauCycleCommence),
  'draw': NotificationEntry(NotificationKind.vote, KombeL10n.current.ncOrdreDesToursTireAu),
  'swap': NotificationEntry(NotificationKind.vote, KombeL10n.current.ncDemandeDechangeDeTour),
  'swap-ready': NotificationEntry(NotificationKind.vote, KombeL10n.current.ncEchangeDeTourApprouver),
  'swap-applied': NotificationEntry(NotificationKind.vote, KombeL10n.current.ncEchangeDeTourApplique),
};

/// Repli par catégorie serveur (anciennes notifications sans topic).
NotificationEntry entryFor(String topic, String kind) =>
    notificationCatalog[topic] ??
    switch (kind) {
      'due_reminder' => NotificationEntry(NotificationKind.contribution, KombeL10n.current.ncUneCotisationArriveEcheance),
      'meeting_reminder' => NotificationEntry(NotificationKind.meeting, KombeL10n.current.ncSeanceDansLesProchainsJours),
      'validation_waiting' => NotificationEntry(NotificationKind.validation, KombeL10n.current.ncUneValidationVousAttend),
      'payout_recorded' => NotificationEntry(NotificationKind.contribution, KombeL10n.current.ntRemiseEnregistree),
      'fine_issued' => NotificationEntry(NotificationKind.dispute, KombeL10n.current.fkOther),
      'aid_decided' => NotificationEntry(NotificationKind.system, KombeL10n.current.ntDecisionSurUneDemandeDe),
      'order_change' => NotificationEntry(NotificationKind.vote, KombeL10n.current.ncOrdreDesTours),
      'membership' => NotificationEntry(NotificationKind.system, KombeL10n.current.ncMembresDuGroupe),
      'minutes_ready' => NotificationEntry(NotificationKind.meeting, KombeL10n.current.ntProcesVerbalDisponible),
      'decision' => NotificationEntry(NotificationKind.vote, KombeL10n.current.ncVoteDeLassociation),
      _ => NotificationEntry(NotificationKind.system, KombeL10n.current.ncNouveauteDansVotreGroupe),
    };

/// Destination contrôlée : toujours dans le bon groupe. La nature précise
/// (`topic`, `subjectId`) donne un lien direct ; à défaut, la cible serveur
/// (`target`) est traduite par [notificationRoute].
NotificationDestination destinationFor(KombeNotification n) {
  // Demande refusée, exclusion : le groupe n'est plus lisible pour moi.
  if (n.code == 'rejected' || n.code == 'statutes_excluded') return const NoDestination();
  final String? g = n.groupId;
  if (g != null && g.isNotEmpty) {
    final String gid = Uri.encodeComponent(g);
    final String? s = n.subjectId == null ? null : Uri.encodeComponent(n.subjectId!);
    final NotificationDestination? byTopic = switch (n.topic) {
      'declared' when s != null => InAppDestination('/app/validations/$s'),
      'declared' || 'toControl' => const InAppDestination('/app/validations'),
      'rejected' => const InAppDestination('/app/contributions'),
      'due' => InAppDestination('/app/groups/$gid/contributions/new'),
      'payout' || 'received' || 'reserve' => WebDestination('/groupe/$gid/argent', KombeL10n.current.ncOuvrirLaTresorerieDansKombe),
      'fund' => InAppDestination('/app/groups/$gid/funds'),
      'decision' || 'decision-closed' when s != null => InAppDestination('/app/votes/$s'),
      'decision' || 'decision-closed' || 'decision-lifted' => const InAppDestination('/app/votes'),
      // Mes amendes (contestation possible) : dans l'application.
      'fine' || 'fineDecision' => const InAppDestination('/app/fines'),
      'contest' => WebDestination('/groupe/$gid/discipline', KombeL10n.current.ncOuvrirLaDisciplineDansKombe),
      'aid' || 'aidDecision' || 'aidPaid' => WebDestination('/groupe/$gid/discipline', KombeL10n.current.ncOuvrirLesSecoursDansKombe),
      'meetingSoon' || 'minutes' => WebDestination('/groupe/$gid/seances', KombeL10n.current.ncOuvrirLesSeancesDansKombe),
      'statutes' => InAppDestination('/app/groups/$gid/rules'),
      'join' || 'role' => InAppDestination('/app/groups/$gid/members'),
      'cycle' || 'draw' || 'swap' || 'swap-ready' || 'swap-applied' => InAppDestination('/app/groups/$gid/cycle'),
      _ => null,
    };
    if (byTopic != null) return byTopic;
  }
  final String? route = notificationRoute(target: n.target, groupId: n.groupId, code: n.code);
  return route == null ? const NoDestination() : InAppDestination(route);
}
