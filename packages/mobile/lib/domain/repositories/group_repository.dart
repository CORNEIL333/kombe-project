import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../entities/cycle.dart';
import '../entities/group.dart';

abstract interface class GroupRepository {
  Future<Resource<List<GroupSummary>>> listGroups();
  Future<Resource<GroupDetails>> getGroup(String groupId);

  /// Membres actifs ET demandes d'adhésion en attente (`state == 'pending'`).
  Future<Resource<List<GroupMember>>> listMembers(String groupId);
  Future<Resource<GroupMember>> getMember(String groupId, String identityId);
  Future<Resource<CycleDetails>> getCycle(String groupId);
  Future<Resource<List<String>>> getRules(String groupId);
  Future<OperationResult<void>> joinGroup(String invitationCode);

  /// Crée un lien d'invitation (`POST /v1/tontines/:id/invitations`) et rend
  /// le code, le lien et le texte WhatsApp à partager.
  Future<OperationResult<GroupInvitation>> createInvitation(String groupId);

  /// Crée une tontine via l'API réelle `POST /v1/tontines` : le bureau
  /// fournit les vrais paramètres (nom, cotisation par part, rythme, date
  /// de première séance, heure limite, nombre max de membres, caisses
  /// annexes). Le serveur choisit seul l'identifiant retourné. L'ordre de
  /// tour se règle à chaque saison, au démarrage du cycle — pas ici.
  Future<OperationResult<String>> createGroup(TontineCreation draft);

  /// Démarre le premier cycle (`POST /v1/tontines/:id/cycle`) : le bureau
  /// choisit l'ordre de passage de la saison. Le tirage est vérifiable
  /// (engagement publié, graine révélée au démarrage). Conditions serveur :
  /// au moins deux membres actifs, un trésorier désigné, statuts acceptés
  /// par tous.
  Future<OperationResult<void>> startCycle(String groupId, CycleOrderKind order);

  /// Lance la saison suivante (`POST /v1/tontines/:id/cycle-renewals`)
  /// une fois tous les tours clos : les numéros de tour continuent (N+1…)
  /// et un nouvel ordre peut être choisi.
  Future<OperationResult<void>> renewCycle(String groupId, CycleOrderKind order);

  /// Vue consolidée « mes tontines » (C21 §2.5) : TOUTES les tontines dont
  /// l'identité de session fait partie (multi-adhésion). L'identité est
  /// résolue SERVEUR depuis la session (§14) ; aucune donnée financière.
  Future<Resource<List<MemberGroup>>> listMyGroups();

  // ── Admission et bureau ──────────────────────────────────────────────

  /// Admet ou refuse une demande d'adhésion
  /// (`POST /v1/tontines/:id/members/:mid/admission`).
  Future<OperationResult<void>> decideAdmission({required String groupId, required String membershipId, required bool admit});

  /// Propose une fonction à un membre (`POST /v1/tontines/:id/roles`).
  Future<OperationResult<void>> proposeRole({required String groupId, required String membershipId, required String role});

  /// Accepte une fonction qui m'est proposée
  /// (`POST /v1/tontines/:id/roles/acceptance`).
  Future<OperationResult<void>> acceptRole({required String groupId, required String role});

  // ── Statuts ──────────────────────────────────────────────────────────

  /// Dernière version des statuts ; `null` si aucune n'est encore publiée.
  Future<Resource<TontineStatutes?>> getStatutes(String groupId);

  /// J'accepte CE texte (empreinte `hash`).
  Future<OperationResult<TontineStatutes>> acceptStatutes({required String groupId, required String hash});

  /// Le bureau publie les statuts (délai 1 à 60 jours, conséquence).
  Future<OperationResult<TontineStatutes>> publishStatutes({
    required String groupId,
    required int acceptanceDays,
    required StatutesOnExpiry onExpiry,
  });

  /// Le bureau repousse l'échéance (0 à 60 jours) ou change la conséquence.
  Future<OperationResult<TontineStatutes>> extendStatutesDeadline({
    required String groupId,
    required int extendDays,
    StatutesOnExpiry? onExpiry,
  });

  /// Relance immédiate des retardataires ; rend le nombre de personnes relancées.
  Future<OperationResult<int>> remindStatutes(String groupId);
}
