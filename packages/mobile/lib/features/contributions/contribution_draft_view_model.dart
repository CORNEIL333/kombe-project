import 'package:flutter/foundation.dart';

import '../../core/formatters/xaf.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/draft_repository.dart';

final class ContributionDraftViewModel extends ChangeNotifier {
  ContributionDraftViewModel(this._repository, this.groupId, {this.localId});

  final ContributionDraftRepository _repository;
  final String groupId;
  String? localId;

  ContributionDraft? _draft;
  ContributionDraft? get draft => _draft;

  bool loading = false;

  Future<void> load() async {
    if (localId == null) return;
    loading = true;
    notifyListeners();
    _draft = await _repository.getDraft(localId!);
    loading = false;
    notifyListeners();
  }

  Future<ContributionDraft?> saveInformation({
    required String amountText,
    required PaymentChannel channel,
    String? note,
  }) async {
    final int? amount = Xaf.parseInteger(amountText);
    if (amount == null || amount <= 0) return null;
    final String id =
        localId ?? 'draft-${DateTime.now().toUtc().microsecondsSinceEpoch}';
    final ContributionDraft next = ContributionDraft(
      localId: id,
      groupId: groupId,
      amountXaf: amount,
      channel: channel,
      updatedAtUtc: DateTime.now().toUtc(),
      note: note?.trim().isEmpty ?? true ? null : note!.trim(),
      evidencePath: _draft?.evidencePath,
    );
    await _repository.upsertDraft(next);
    localId = id;
    _draft = next;
    notifyListeners();
    return next;
  }

  Future<void> attachEvidence(String filePath) async {
    final ContributionDraft? current = _draft;
    if (current == null) return;
    final ContributionDraft next = ContributionDraft(
      localId: current.localId,
      groupId: current.groupId,
      amountXaf: current.amountXaf,
      channel: current.channel,
      updatedAtUtc: DateTime.now().toUtc(),
      note: current.note,
      evidencePath: filePath,
    );
    await _repository.upsertDraft(next);
    _draft = next;
    notifyListeners();
  }
}
