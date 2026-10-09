import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/cycle.dart';
import '../entities/group.dart';

abstract interface class GroupRepository {
  Future<Resource<List<GroupSummary>>> listGroups();
  Future<Resource<GroupDetails>> getGroup(String groupId);
  Future<Resource<List<GroupMember>>> listMembers(String groupId);
  Future<Resource<GroupMember>> getMember(String groupId, String identityId);
  Future<Resource<CycleDetails>> getCycle(String groupId);
  Future<Resource<List<String>>> getRules(String groupId);
  Future<OperationResult<void>> joinGroup(String invitationCode);
  Future<OperationResult<void>> inviteMember({
    required String groupId,
    required String phoneE164,
  });

  /// Crée une tontine (C03 §2.1-2.3) : nom, modèle, typologie de rotation,
  /// parent de supervision éventuel (C21). Renvoie l'identifiant du groupe
  /// créé par le serveur (jamais choisi localement).
  Future<OperationResult<String>> createGroup({
    required String groupId,
    required String displayName,
    required String tontineModel,
    required String rotationType,
    String? parentGroupId,
  });

  /// Découvrabilité publique (C03 §4.1) : vue minimale des groupes
  /// ouverts, sans registre réel.
  Future<Resource<List<DiscoverableGroup>>> listDiscoverable();

  /// Parrainage / cooptation : un candidat demande à rejoindre sous la
  /// caution d'un membre actif. Le serveur résout le candidat depuis la
  /// session ; `candidateId` n'est transmis que pour satisfaire le contrat.
  Future<OperationResult<void>> requestSponsorship({
    required String groupId,
    required String sponsorshipId,
    required String candidateId,
    required String sponsorId,
  });
}
