import '../../domain/entities/auth.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/document.dart';
import '../../domain/entities/fine.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/meeting.dart';
import '../../domain/entities/poll.dart';
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

String pollStateLabel(PollState s) => switch (s) {
      PollState.open => KombeL10n.current.pollOpen,
      PollState.closed => KombeL10n.current.pollClosed,
      PollState.cancelled => KombeL10n.current.pollCancelled,
    };

String meetingStateLabel(MeetingState s) => switch (s) {
      MeetingState.planned => KombeL10n.current.mtgPlanned,
      MeetingState.open => KombeL10n.current.mtgOpen,
      MeetingState.closed => KombeL10n.current.mtgClosed,
      MeetingState.cancelled => KombeL10n.current.mtgCancelled,
    };

String meetingFormatLabel(MeetingFormat f) => switch (f) {
      MeetingFormat.inPerson => KombeL10n.current.fmtInPerson,
      MeetingFormat.online => KombeL10n.current.fmtOnline,
      MeetingFormat.hybrid => KombeL10n.current.fmtHybrid,
    };

String attendanceStatusLabel(AttendanceStatus s) => switch (s) {
      AttendanceStatus.present => KombeL10n.current.attPresent,
      AttendanceStatus.late => KombeL10n.current.attLate,
      AttendanceStatus.excused => KombeL10n.current.attExcused,
      AttendanceStatus.absent => KombeL10n.current.attAbsent,
      AttendanceStatus.represented => KombeL10n.current.attRepresented,
      AttendanceStatus.unknown => KombeL10n.current.attUnknown,
    };

String fineStateLabel(FineState s) => switch (s) {
      FineState.issued => KombeL10n.current.fineIssued,
      FineState.contested => KombeL10n.current.fineContested,
      FineState.paid => KombeL10n.current.finePaid,
      FineState.cancelled => KombeL10n.current.fineCancelled,
    };

String fineKindLabel(String kind) => switch (kind) {
      'late_contribution' => KombeL10n.current.fkLateContribution,
      'meeting_late' => KombeL10n.current.fkMeetingLate,
      'meeting_absence' => KombeL10n.current.fkMeetingAbsence,
      'indiscipline' => KombeL10n.current.fkIndiscipline,
      _ => KombeL10n.current.fkOther,
    };

extension CycleOrderKindLabel on CycleOrderKind {
  String get label => switch (this) {
        CycleOrderKind.draw => KombeL10n.current.orderDraw,
        CycleOrderKind.joinOrder => KombeL10n.current.orderJoin,
      };

  String get aide => switch (this) {
        CycleOrderKind.draw => KombeL10n.current.orderDrawHelp,
        CycleOrderKind.joinOrder => KombeL10n.current.orderJoinHelp,
      };
}

extension LoginChannelLabels on LoginChannel {
  /// Libellé du choix de voie.
  String get label => switch (this) {
        LoginChannel.email => KombeL10n.current.chEmail,
        LoginChannel.sms => 'SMS',
        LoginChannel.whatsapp => 'WhatsApp',
      };

  /// Libellé du champ de saisie.
  String get fieldLabel => switch (this) {
        LoginChannel.email => KombeL10n.current.fieldEmail,
        LoginChannel.sms || LoginChannel.whatsapp => KombeL10n.current.fieldPhone,
      };

  /// « … reçu par e-mail / SMS / WhatsApp ».
  String get viaLabel => switch (this) {
        LoginChannel.email => KombeL10n.current.viaEmail,
        LoginChannel.sms => KombeL10n.current.viaSms,
        LoginChannel.whatsapp => KombeL10n.current.viaWhatsapp,
      };
}
