import '../../core/api/api_failure.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../domain/entities/cycle.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import 'kombe_api_client.dart';

/// Implémentation HTTP réelle de [GroupRepository], branchée EXACTEMENT sur les
/// routes d'amorçage prouvées base réelle (0024, `pgOnboardingStore.proof.mjs`) :
///   * `POST /groups` (créer une tontine : nom, modèle, typologie, parent) ;
///   * `GET  /discoverable-groups` (découvrabilité publique, sans registre) ;
///   * `GET  /me/groups` (vue multi-adhésion « mes tontines », C21 §2.5) ;
///   * `POST /groups/{id}/sponsorships` (parrainage / cooptation) ;
///   * `POST /invitations/{code}/redemptions` (rejoindre via un code reçu) ;
///   * `POST /groups/{id}/memberships` (invitation directe d'un handle).
///
/// Honnêteté contractuelle : les lectures de cycle/membres/détail n'ont PAS
/// d'endpoint GET dédié au socle réel ; elles renvoient [ResourceUnavailable]
/// plutôt que d'inventer une source. Les décisions (identités, unicité, droits,
/// typologie P1) restent SERVEUR — le client ne fait qu'appeler le contrat.
///
/// Les routes sont des chemins NUS (sans préfixe `/v1`) : c'est la base du
/// [KombeApiClient] (`--dart-define=KOMBE_API_BASE_URL`) qui porte le `/v1`.
final class HttpGroupRepository implements GroupRepository {
  HttpGroupRepository({required KombeApiClient api}) : _api = api;

  final KombeApiClient _api;

  @override
  Future<Resource<List<GroupSummary>>> listGroups() async =>
      const ResourceUnavailable<List<GroupSummary>>();

  @override
  Future<Resource<GroupDetails>> getGroup(String groupId) async =>
      const ResourceUnavailable<GroupDetails>();

  @override
  Future<Resource<List<GroupMember>>> listMembers(String groupId) async =>
      const ResourceUnavailable<List<GroupMember>>();

  @override
  Future<Resource<GroupMember>> getMember(String groupId, String identityId) async =>
      const ResourceUnavailable<GroupMember>();

  @override
  Future<Resource<CycleDetails>> getCycle(String groupId) async =>
      const ResourceUnavailable<CycleDetails>();

  @override
  Future<Resource<List<String>>> getRules(String groupId) async =>
      const ResourceUnavailable<List<String>>();

  @override
  Future<OperationResult<String>> createGroup({
    required String groupId,
    required String displayName,
    required String tontineModel,
    required String rotationType,
    String? parentGroupId,
  }) async {
    try {
      final ApiResponse res = await _api.post('/groups', <String, Object?>{
        'groupId': groupId,
        'displayName': displayName,
        'tontineModel': tontineModel,
        'rotationType': rotationType,
        if (parentGroupId != null && parentGroupId.isNotEmpty)
          'parentGroupId': parentGroupId,
      });
      final Object? id = res.body['groupId'];
      return OperationSuccess<String>((id is String && id.isNotEmpty) ? id : groupId);
    } on ApiFailure catch (e) {
      return OperationFailure<String>(e);
    }
  }

  @override
  Future<Resource<List<DiscoverableGroup>>> listDiscoverable() async {
    try {
      final ApiResponse res = await _api.get('/discoverable-groups');
      final Object? items = res.body['items'];
      if (items is! List<dynamic>) {
        return ResourceFailure<List<DiscoverableGroup>>(
          ApiFailure(statusCode: res.statusCode, code: 'RESPONSE_NOT_JSON'),
        );
      }
      final List<DiscoverableGroup> groups = <DiscoverableGroup>[
        for (final Object? e in items)
          if (e is Map<String, dynamic>)
            DiscoverableGroup(
              groupId: e['groupId'] as String? ?? '',
              name: e['groupName'] as String? ?? '',
              tontineModel: e['tontineModel'] as String? ?? 'personnalise',
              rotationType: e['rotationType'] as String? ?? 'rotative_fermee',
            ),
      ];
      return ResourceReady<List<DiscoverableGroup>>(groups);
    } on ApiFailure catch (e) {
      return ResourceFailure<List<DiscoverableGroup>>(e);
    }
  }

  @override
  Future<Resource<List<MemberGroup>>> listMyGroups() async {
    try {
      final ApiResponse res = await _api.get('/me/groups');
      final Object? items = res.body['items'];
      if (items is! List<dynamic>) {
        return ResourceFailure<List<MemberGroup>>(
          ApiFailure(statusCode: res.statusCode, code: 'RESPONSE_NOT_JSON'),
        );
      }
      final List<MemberGroup> groups = <MemberGroup>[
        for (final Object? e in items)
          if (e is Map<String, dynamic>)
            MemberGroup(
              groupId: e['groupId'] as String? ?? '',
              displayName: e['displayName'] as String? ?? '',
              tontineModel: e['tontineModel'] as String? ?? 'personnalise',
              rotationType: e['rotationType'] as String? ?? 'rotative_fermee',
              groupState: e['groupState'] as String? ?? 'configuration',
              membershipState: e['membershipState'] as String? ?? 'pending',
              parentGroupId: e['parentGroupId'] as String?,
            ),
      ];
      return ResourceReady<List<MemberGroup>>(groups);
    } on ApiFailure catch (e) {
      return ResourceFailure<List<MemberGroup>>(e);
    }
  }

  @override
  Future<OperationResult<void>> requestSponsorship({
    required String groupId,
    required String sponsorshipId,
    required String candidateId,
    required String sponsorId,
  }) async {
    try {
      await _api.post('/groups/$groupId/sponsorships', <String, Object?>{
        'sponsorshipId': sponsorshipId,
        // Le serveur résout le candidat depuis la session (corps ignoré en mode
        // réel) ; le champ reste requis par le contrat de schéma.
        'candidateId': candidateId,
        'sponsorId': sponsorId,
      });
      return const OperationSuccess<void>(null);
    } on ApiFailure catch (e) {
      return OperationFailure<void>(e);
    }
  }

  @override
  Future<OperationResult<void>> joinGroup(String invitationCode) async {
    try {
      await _api.post('/invitations/$invitationCode/redemptions', <String, Object?>{});
      return const OperationSuccess<void>(null);
    } on ApiFailure catch (e) {
      return OperationFailure<void>(e);
    }
  }

  @override
  Future<OperationResult<void>> inviteMember({
    required String groupId,
    required String phoneE164,
  }) async {
    try {
      await _api.post('/groups/$groupId/memberships', <String, Object?>{
        'handle': phoneE164,
      });
      return const OperationSuccess<void>(null);
    } on ApiFailure catch (e) {
      return OperationFailure<void>(e);
    }
  }
}
