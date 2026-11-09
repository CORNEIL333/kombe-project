import '../../core/state/resource.dart';
import '../entities/contribution.dart';

abstract interface class ContributionRepository {
  Future<Resource<List<Contribution>>> listHistory({String? groupId});
  Future<Resource<Contribution>> getContribution(String contributionId);
  /// Échéances encore ouvertes pour moi dans ce groupe (reste à régler).
  Future<Resource<List<OpenDue>>> openDues(String groupId);

  /// Envoie les lignes non encore enregistrées du plan figé du brouillon.
  /// S'arrête à la première ligne en échec ; ne lève jamais.
  Future<DeclarationReceipt> sendDeclaration(ContributionDraft draft);
}
