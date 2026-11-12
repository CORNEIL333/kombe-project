import '../../domain/entities/contribution.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/document.dart';
import '../../domain/entities/group.dart';
import '../../l10n/kombe_l10n.dart';

/// Libellés affichés pour les valeurs du domaine. Une valeur technique
/// (`underReview`, `treasurer`…) n'apparaît jamais telle quelle à l'écran.
abstract final class KombeLabels {
  static String role(GroupRole r) => switch (r) {
        GroupRole.member => KombeL10n.current.roleMemberLabel,
        GroupRole.treasurer => KombeL10n.current.roleTreasurer,
        GroupRole.controller => KombeL10n.current.roleAuditor,
        GroupRole.secretary => KombeL10n.current.roleSecretaryGeneral,
        GroupRole.administrator => KombeL10n.current.rolePresidency,
      };

  static String contributionStatus(ContributionStatus s) => switch (s) {
        ContributionStatus.draft => KombeL10n.current.csDraft,
        ContributionStatus.submitted => KombeL10n.current.csSubmitted,
        ContributionStatus.confirmed => KombeL10n.current.csConfirmed,
        ContributionStatus.validated => KombeL10n.current.csValidated,
        ContributionStatus.rejected => KombeL10n.current.csRejected,
        ContributionStatus.disputed => KombeL10n.current.csDisputed,
        ContributionStatus.compensated => KombeL10n.current.csCompensated,
      };

  static String channel(PaymentChannel? c) => switch (c) {
        PaymentChannel.orangeMoney => 'Orange Money',
        PaymentChannel.mtnMomo => 'MTN Mobile Money',
        PaymentChannel.mobileMoney => 'Mobile Money',
        PaymentChannel.bankTransfer => KombeL10n.current.bankTransfer,
        PaymentChannel.internationalTransfer => KombeL10n.current.channelFromAbroad,
        PaymentChannel.cash => KombeL10n.current.cash,
        null => '—',
      };

  static String documentKind(DocumentKind k) => switch (k) {
        DocumentKind.statement => KombeL10n.current.docStatement,
        DocumentKind.cycleReport => KombeL10n.current.docCycleReport,
        DocumentKind.export => KombeL10n.current.docExport,
        DocumentKind.rules => KombeL10n.current.rules,
        DocumentKind.dispute => KombeL10n.current.docDispute,
        DocumentKind.other => KombeL10n.current.docOther,
      };

  static String beneficiaryStatus(BeneficiaryStatus s) => switch (s) {
        BeneficiaryStatus.received => KombeL10n.current.benReceived,
        BeneficiaryStatus.current => KombeL10n.current.benCurrent,
        BeneficiaryStatus.upcoming => KombeL10n.current.benUpcoming,
      };
}

/// Libellé terrain d'une fonction (identifiant technique de l'API).
String apiRoleLabel(String role) => switch (role) {
      'animator' => KombeL10n.current.roleAnimator,
      'vice_president' => KombeL10n.current.roleVicePresident,
      'secretary' => KombeL10n.current.roleSecretaryGeneral,
      'treasurer' => KombeL10n.current.roleTreasurer,
      'treasurer_deputy' => KombeL10n.current.roleTreasurerDeputy,
      'auditor' => KombeL10n.current.roleAuditor,
      'censor' => KombeL10n.current.roleCensor,
      'advisor' => KombeL10n.current.roleAdvisor,
      _ => KombeL10n.current.roleMemberLabel,
    };

String cadenceKindLabel(CadenceKind kind) => switch (kind) {
  CadenceKind.daily => KombeL10n.current.cadenceDaily,
  CadenceKind.weekly => KombeL10n.current.cadenceWeekly,
  CadenceKind.biweekly => KombeL10n.current.cadenceBiweekly,
  CadenceKind.everyNDays => KombeL10n.current.cadenceEveryNDays,
  CadenceKind.monthlyDay => KombeL10n.current.cadenceMonthlyDay,
  CadenceKind.monthlyNthWeekday => KombeL10n.current.cadenceMonthlyNthWeekday,
};
