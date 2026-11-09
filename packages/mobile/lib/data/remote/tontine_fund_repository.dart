import '../../core/api/api_failure.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../domain/entities/fund.dart';
import '../../domain/repositories/fund_repository.dart';
import 'kombe_api_client.dart';

/// Caisses d'un groupe sur l'API « tontine réelle » (docs/API_TONTINE.md).
final class TontineFundRepository implements FundRepository {
  const TontineFundRepository({required KombeApiClient api}) : _api = api;
  final KombeApiClient _api;

  static const Set<String> _bureau = <String>{'animator', 'vice_president', 'treasurer'};

  String _t(String groupId) => '/tontines/${Uri.encodeComponent(groupId)}';

  static int _xaf(Object? v) => int.tryParse('${v ?? 0}') ?? 0;

  static GroupFund _fund(Map<String, dynamic> f) {
    final Map<String, dynamic>? c = f['custom'] as Map<String, dynamic>?;
    return GroupFund(
      id: '${f['fundId']}',
      kind: '${f['kind']}',
      name: '${f['name']}',
      closed: f['state'] == 'closed',
      confirmedXaf: _xaf(f['confirmedBalance']),
      pendingXaf: _xaf(f['pendingIn']),
      perMeetingXaf: _xaf(f['perMeeting']),
      custom: c == null
          ? null
          : CustomFundRules(
              mode: fundModeFrom(c['mode']),
              currentAmountXaf: _xaf(c['currentAmount']),
              purpose: c['purpose'] as String?,
              targetXaf: c['target'] == null ? null : _xaf(c['target']),
              closedOn: c['closedOn'] as String?,
            ),
    );
  }

  @override
  Future<Resource<GroupFunds>> listFunds(String groupId) async {
    try {
      final Map<String, dynamic> detail = (await _api.get(_t(groupId))).body;
      final List<dynamic> roles = ((detail['me'] as Map<String, dynamic>?)?['roles'] as List<dynamic>?) ?? const <dynamic>[];
      final List<dynamic> raw = (detail['funds'] as List<dynamic>?) ?? const <dynamic>[];
      return ResourceReady<GroupFunds>(GroupFunds(
        funds: raw
            .cast<Map<String, dynamic>>()
            .where((Map<String, dynamic> f) => f['kind'] != 'loan' && f['kind'] != 'collector')
            .map(_fund)
            .toList(),
        canManage: roles.any((dynamic r) => _bureau.contains('$r')),
      ));
    } on ApiFailure catch (e) {
      return ResourceFailure<GroupFunds>(e);
    }
  }

  @override
  Future<OperationResult<void>> createFund(String groupId, FundCreation creation) async {
    try {
      await _api.postOnce('${_t(groupId)}/funds', <String, dynamic>{
        'name': creation.name.trim(),
        'mode': fundModeApi(creation.mode),
        if (creation.mode != FundMode.free && creation.amountXaf != null) 'amount': '${creation.amountXaf}',
        if ((creation.purpose ?? '').trim().isNotEmpty) 'purpose': creation.purpose!.trim(),
        if ((creation.targetXaf ?? 0) > 0) 'target': '${creation.targetXaf}',
      });
      return const OperationSuccess<void>(null);
    } on ApiFailure catch (e) {
      return OperationFailure<void>(e);
    }
  }

  @override
  Future<OperationResult<void>> closeFund(String groupId, String fundId) async {
    try {
      await _api.patch('${_t(groupId)}/funds/${Uri.encodeComponent(fundId)}', <String, dynamic>{'close': true});
      return const OperationSuccess<void>(null);
    } on ApiFailure catch (e) {
      return OperationFailure<void>(e);
    }
  }
}
