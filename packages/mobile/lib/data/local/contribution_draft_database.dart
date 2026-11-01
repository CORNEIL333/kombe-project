import 'dart:convert';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart' as sqflite;

import '../../domain/entities/contribution.dart';
import '../../domain/repositories/draft_repository.dart';

final class ContributionDraftDatabase implements ContributionDraftRepository {
  ContributionDraftDatabase({
    sqflite.DatabaseFactory? databaseFactory,
    Future<String> Function()? databasePathProvider,
  })  : _factory = databaseFactory ?? sqflite.databaseFactory,
        _databasePathProvider = databasePathProvider ?? _defaultDatabasePath;

  final sqflite.DatabaseFactory _factory;
  final Future<String> Function() _databasePathProvider;
  sqflite.Database? _db;


  static Future<String> _defaultDatabasePath() async {
    final String base = (await getApplicationSupportDirectory()).path;
    return p.join(base, 'kombe_mobile_local.db');
  }

  Future<sqflite.Database> _open() async {
    if (_db case final sqflite.Database existing) {
      return existing;
    }
    final String databasePath = await _databasePathProvider();
    final sqflite.Database db = await _factory.openDatabase(
      databasePath,
      options: sqflite.OpenDatabaseOptions(
        version: 2,
        onCreate: (sqflite.Database database, int version) async {
          await database.execute(
            'CREATE TABLE contribution_draft ('
            'local_id TEXT PRIMARY KEY,'
            'group_id TEXT NOT NULL,'
            'amount_xaf INTEGER NOT NULL CHECK(amount_xaf >= 0),'
            'payment_channel TEXT NOT NULL,'
            'note TEXT,'
            'evidence_path TEXT,'
            'updated_at_utc TEXT NOT NULL,'
            'reference TEXT,'
            'plan_json TEXT'
            ')',
          );
        },
        // v2 : référence distincte du motif, plan d'envoi figé (reprise sans
        // doublon). Les anciens brouillons gardent leur note comme motif.
        onUpgrade: (sqflite.Database database, int from, int to) async {
          if (from < 2) {
            await database.execute('ALTER TABLE contribution_draft ADD COLUMN reference TEXT');
            await database.execute('ALTER TABLE contribution_draft ADD COLUMN plan_json TEXT');
          }
        },
      ),
    );
    _db = db;
    return db;
  }

  @override
  Future<List<ContributionDraft>> listDrafts() async {
    final sqflite.Database db = await _open();
    final List<Map<String, Object?>> rows = await db.query(
      'contribution_draft',
      orderBy: 'updated_at_utc DESC',
    );
    return rows.map(_fromRow).toList(growable: false);
  }

  @override
  Future<ContributionDraft?> getDraft(String localId) async {
    final sqflite.Database db = await _open();
    final List<Map<String, Object?>> rows = await db.query(
      'contribution_draft',
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
      limit: 1,
    );
    return rows.isEmpty ? null : _fromRow(rows.first);
  }

  @override
  Future<void> upsertDraft(ContributionDraft draft) async {
    final sqflite.Database db = await _open();
    await db.insert(
      'contribution_draft',
      <String, Object?>{
        'local_id': draft.localId,
        'group_id': draft.groupId,
        'amount_xaf': draft.amountXaf,
        'payment_channel': draft.channel.name,
        // `note` porte désormais le motif « pas de référence ».
        'note': draft.noReferenceReason,
        'evidence_path': null,
        'reference': draft.reference,
        'plan_json': draft.plan.isEmpty
            ? null
            : jsonEncode(draft.plan.map((DeclarationLine l) => l.toJson()).toList()),
        'updated_at_utc': draft.updatedAtUtc.toUtc().toIso8601String(),
      },
      conflictAlgorithm: sqflite.ConflictAlgorithm.replace,
    );
  }

  @override
  Future<void> deleteDraft(String localId) async {
    final sqflite.Database db = await _open();
    await db.delete(
      'contribution_draft',
      where: 'local_id = ?',
      whereArgs: <Object?>[localId],
    );
  }

  @override
  Future<void> purgeAll() async {
    final sqflite.Database db = await _open();
    await db.delete('contribution_draft');
  }

  static List<DeclarationLine> _plan(String? raw) {
    if (raw == null || raw.isEmpty) return const <DeclarationLine>[];
    try {
      return (jsonDecode(raw) as List<dynamic>)
          .map((dynamic j) => DeclarationLine.fromJson(j as Map<String, dynamic>))
          .toList(growable: false);
    } catch (_) {
      return const <DeclarationLine>[];
    }
  }

  ContributionDraft _fromRow(Map<String, Object?> row) {
    return ContributionDraft(
      localId: row['local_id']! as String,
      groupId: row['group_id']! as String,
      amountXaf: row['amount_xaf']! as int,
      channel: PaymentChannel.values.byName(row['payment_channel']! as String),
      reference: row['reference'] as String?,
      noReferenceReason: row['note'] as String?,
      plan: _plan(row['plan_json'] as String?),
      updatedAtUtc: DateTime.parse(row['updated_at_utc']! as String).toUtc(),
    );
  }
}
