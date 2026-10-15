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

  /// Crée une tontine via l'API réelle `POST /v1/tontines` : le bureau
  /// fournit les vrais paramètres (nom, cotisation par part, rythme, date
  /// de première séance, heure limite, nombre max de membres). Le serveur
  /// choisit seul l'identifiant retourné ; montant et fréquence ne sont
  /// JAMAIS décidés à la place de l'admin. L'ordre de tour (tirage vérifiable,
  /// ordre d'arrivée, décidé par le bureau) se règle à chaque saison, au
  /// démarrage du cycle — pas à la création.
  Future<OperationResult<String>> createGroup(TontineCreation draft);

  /// Découvrabilité publique (C03 §4.1) : vue minimale des groupes
  /// ouverts, sans registre réel.
  Future<Resource<List<DiscoverableGroup>>> listDiscoverable();

  /// Démarre le premier cycle (`POST /v1/tontines/:id/cycle`) : le bureau
  /// choisit l'ordre de passage de la saison. Le tirage est vérifiable
  /// (engagement publié, graine révélée au démarrage) ; l'ordre manuel
  /// part par part reste dans la PWA. Conditions serveur : au moins deux
  /// membres actifs, un trésorier désigné, statuts acceptés par tous.
  Future<OperationResult<void>> startCycle(String groupId, CycleOrderKind order);

  /// Lance la saison suivante (`POST /v1/tontines/:id/cycle-renewals`)
  /// une fois tous les tours clos : les numéros de tour continuent (N+1…)
  /// et un nouvel ordre peut être choisi.
  Future<OperationResult<void>> renewCycle(String groupId, CycleOrderKind order);

  /// Vue consolidée « mes tontines » (C21 §2.5) : TOUTES les tontines dont
  /// l'identité de session fait partie (multi-adhésion). L'identité est
  /// résolue SERVEUR depuis la session (§14) ; aucune donnée financière.
  Future<Resource<List<MemberGroup>>> listMyGroups();

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
