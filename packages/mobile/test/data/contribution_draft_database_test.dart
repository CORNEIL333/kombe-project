import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/data/local/contribution_draft_database.dart';
import 'package:kombe_mobile/domain/entities/contribution.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  sqfliteFfiInit();

  test('local contribution draft round-trips without inventing server state', () async {
    final ContributionDraftDatabase repository = ContributionDraftDatabase(
      databaseFactory: databaseFactoryFfi,
      databasePathProvider: () async => inMemoryDatabasePath,
    );

    final ContributionDraft draft = ContributionDraft(
      localId: 'draft-local-only',
      groupId: 'group-from-real-navigation',
      amountXaf: 100,
      channel: PaymentChannel.cash,
      updatedAtUtc: DateTime.utc(2026, 9, 30),
    );

    await repository.upsertDraft(draft);
    final ContributionDraft? loaded = await repository.getDraft(draft.localId);

    expect(loaded, isNotNull);
    expect(loaded!.amountXaf, 100);
    expect(loaded.groupId, 'group-from-real-navigation');
    expect(loaded.channel, PaymentChannel.cash);
  });
}
