import '../../domain/entities/contribution.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/document.dart';
import '../../domain/entities/group.dart';

/// Libellés affichés pour les valeurs du domaine. Une valeur technique
/// (`underReview`, `treasurer`…) n'apparaît jamais telle quelle à l'écran.
abstract final class KombeLabels {
  static String role(GroupRole r) => switch (r) {
        GroupRole.member => 'Membre',
        GroupRole.treasurer => 'Trésorier',
        GroupRole.controller => 'Commissaire aux comptes',
        GroupRole.secretary => 'Secrétaire général',
        GroupRole.administrator => 'Présidence',
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
        PaymentChannel.orangeMoney => 'Orange Money',
        PaymentChannel.mtnMomo => 'MTN Mobile Money',
        PaymentChannel.mobileMoney => 'Mobile Money',
        PaymentChannel.bankTransfer => 'Virement bancaire',
        PaymentChannel.internationalTransfer => 'Transfert depuis l’étranger',
        PaymentChannel.cash => 'Espèces',
        null => '—',
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
