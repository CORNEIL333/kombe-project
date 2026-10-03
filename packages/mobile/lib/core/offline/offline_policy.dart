enum OfflineCapability {
  readCachedMetadata,
  editLocalDraft,
  submitContribution,
  validateContribution,
  vote,
  changeRole,
  publishRules,
  confirmDisbursement,
}

abstract final class OfflinePolicy {
  static bool isAllowed(OfflineCapability capability) {
    return switch (capability) {
      OfflineCapability.readCachedMetadata => true,
      OfflineCapability.editLocalDraft => true,
      OfflineCapability.submitContribution => false,
      OfflineCapability.validateContribution => false,
      OfflineCapability.vote => false,
      OfflineCapability.changeRole => false,
      OfflineCapability.publishRules => false,
      OfflineCapability.confirmDisbursement => false,
    };
  }
}
