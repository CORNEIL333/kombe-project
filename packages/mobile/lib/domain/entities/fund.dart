/// Caisses du groupe : celles du règlement (cagnotte, secours, réserve…) et
/// celles que la tontine ouvre elle-même, chacune avec sa règle.
/// KÓMBE ne garde pas l'argent : les totaux sont des déclarations confirmées
/// par le trésorier.
enum FundMode { eachMeeting, oneTime, free }

FundMode fundModeFrom(Object? v) => switch ('$v') {
      'each_meeting' => FundMode.eachMeeting,
      'one_time' => FundMode.oneTime,
      _ => FundMode.free,
    };

String fundModeApi(FundMode m) => switch (m) {
      FundMode.eachMeeting => 'each_meeting',
      FundMode.oneTime => 'one_time',
      FundMode.free => 'free',
    };

final class CustomFundRules {
  const CustomFundRules({
    required this.mode,
    required this.currentAmountXaf,
    this.purpose,
    this.targetXaf,
    this.closedOn,
  });

  final FundMode mode;
  final int currentAmountXaf;
  final String? purpose;
  final int? targetXaf;

  /// Date de clôture (AAAA-MM-JJ) : plus rien n'est réclamé après ce jour.
  final String? closedOn;
}

final class GroupFund {
  const GroupFund({
    required this.id,
    required this.kind,
    required this.name,
    required this.closed,
    required this.confirmedXaf,
    required this.pendingXaf,
    required this.perMeetingXaf,
    this.custom,
  });

  final String id;
  final String kind;
  final String name;
  final bool closed;
  final int confirmedXaf;
  final int pendingXaf;
  final int perMeetingXaf;

  /// Règles propres (null : caisse fixée par le règlement).
  final CustomFundRules? custom;
}

final class GroupFunds {
  const GroupFunds({required this.funds, required this.canManage});
  final List<GroupFund> funds;

  /// Président, vice-président ou trésorier : crée et modifie les caisses.
  final bool canManage;
}

final class FundCreation {
  const FundCreation({required this.name, required this.mode, this.amountXaf, this.purpose, this.targetXaf});
  final String name;
  final FundMode mode;
  final int? amountXaf;
  final String? purpose;
  final int? targetXaf;
}
