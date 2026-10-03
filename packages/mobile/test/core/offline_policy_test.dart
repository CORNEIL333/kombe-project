import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/core/offline/offline_policy.dart';

void main() {
  test('server-authoritative mutations are never allowed offline', () {
    expect(
      OfflinePolicy.isAllowed(OfflineCapability.validateContribution),
      isFalse,
    );
    expect(OfflinePolicy.isAllowed(OfflineCapability.vote), isFalse);
    expect(OfflinePolicy.isAllowed(OfflineCapability.changeRole), isFalse);
    expect(OfflinePolicy.isAllowed(OfflineCapability.publishRules), isFalse);
    expect(
      OfflinePolicy.isAllowed(OfflineCapability.confirmDisbursement),
      isFalse,
    );
  });

  test('local drafts remain allowed offline', () {
    expect(OfflinePolicy.isAllowed(OfflineCapability.editLocalDraft), isTrue);
  });
}
