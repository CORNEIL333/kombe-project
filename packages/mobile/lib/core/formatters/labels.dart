import '../../domain/entities/contribution.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/dispute.dart';
import '../../domain/entities/document.dart';
import '../../domain/entities/group.dart';

/// Libellés affichés pour les valeurs du domaine. Une valeur technique
/// (`underReview`, `treasurer`…) n'apparaît jamais telle quelle à l'écran.
abstract final class KombeLabels {
  static String role(GroupRole r) => switch (r) {
        GroupRole.member => 'Membre',
        GroupRole.treasurer => 'Trésorier',
        GroupRole.controller => 'Contrôleur',
        GroupRole.secretary => 'Secrétaire',
        GroupRole.administrator => 'Administrateur',
      };

  static String contributionStatus(ContributionStatus s) => switch (s) {
        ContributionStatus.draft => 'Brouillon',
        ContributionStatus.submitted => 'En attente de validation',
        ContributionStatus.confirmed => 'Confirmée',
        ContributionStatus.validated => 'Validée',
        ContributionStatus.rejected => 'Rejetée',
        ContributionStatus.disputed => 'Contestée',
        ContributionStatus.compensated => 'Corrigée',
      };

  static String channel(PaymentChannel? c) => switch (c) {
        PaymentChannel.mobileMoney => 'Mobile Money',
        PaymentChannel.bankTransfer => 'Virement bancaire',
        PaymentChannel.cash => 'Espèces',
        null => '—',
      };

  static String disputeStatus(DisputeStatus s) => switch (s) {
        DisputeStatus.open => 'Ouvert',
        DisputeStatus.underReview => 'En cours d’examen',
        DisputeStatus.awaitingInformation => 'Informations demandées',
        DisputeStatus.resolved => 'Résolu',
        DisputeStatus.rejected => 'Rejeté',
      };

  static String documentKind(DocumentKind k) => switch (k) {
        DocumentKind.statement => 'Relevé',
        DocumentKind.cycleReport => 'Rapport de cycle',
        DocumentKind.export => 'Export',
        DocumentKind.rules => 'Règles',
        DocumentKind.dispute => 'Litige',
        DocumentKind.other => 'Document',
      };

  static String beneficiaryStatus(BeneficiaryStatus s) => switch (s) {
        BeneficiaryStatus.received => 'Reçu',
        BeneficiaryStatus.current => 'Tour en cours',
        BeneficiaryStatus.upcoming => 'À venir',
      };
}
