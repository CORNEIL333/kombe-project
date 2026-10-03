import '../entities/contribution.dart';

abstract interface class ContributionDraftRepository {
  Future<List<ContributionDraft>> listDrafts();
  Future<ContributionDraft?> getDraft(String localId);
  Future<void> upsertDraft(ContributionDraft draft);
  Future<void> deleteDraft(String localId);
  Future<void> purgeAll();
}
