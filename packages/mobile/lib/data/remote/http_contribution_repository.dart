import '../../core/api/api_failure.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';
import 'kombe_api_client.dart';

/// Résolution de l'identifiant d'obligation d'une cotisation : le contrat
/// `DeclareContributionRequest` exige `obligationId`, que le brouillon local
/// ne porte pas (il appartient au calendrier serveur). Fourni par l'appelant ;
/// `null` = non résoluble → le client refuse au lieu d'inventer.
typedef ObligationIdResolver = String? Function(ContributionDraft draft);

/// Version d'objet attendue pour la mutation (concurrence optimiste, 18.2) :
/// portée par l'en-tête `If-Match-Version`. Non stockée dans le brouillon.
typedef ExpectedVersionResolver = int? Function(ContributionDraft draft);

/// Fabrique de clé d'idempotence (8..200) : un rejeu du même envoi doit réutilisé
/// la même clé. Fournie par l'appelant (session/file d'attente), jamais devinée.
typedef IdempotencyKeyFactory = String Function(ContributionDraft draft);

/// Implémentation HTTP réelle de [ContributionRepository], branchée sur les
/// seules routes du contrat OpenAPI (C06/C07) :
///
/// - `POST /groups/{groupId}/contributions` — déclaration idempotente
///   (`Idempotency-Key` + `If-Match-Version` obligatoires, montant entier XAF,
///   jamais de flottant, ADR-0002) ;
/// - LECTURE (historique / détail) : AUCUNE route de lecture n'existe dans le
///   contrat → le dépôt le dit honnêtement ([ClientFailure]) au lieu d'inventer
///   un endpoint ou de fabriquer des données. La lecture branchée viendra avec
///   le contrat correspondant.
final class HttpContributionRepository implements ContributionRepository {
  HttpContributionRepository({
    required KombeApiClient api,
    required ObligationIdResolver obligationIdResolver,
    required ExpectedVersionResolver expectedVersionResolver,
    required IdempotencyKeyFactory idempotencyKeyFactory,
  })  : _api = api,
        _obligationIdResolver = obligationIdResolver,
        _expectedVersionResolver = expectedVersionResolver,
        _idempotencyKeyFactory = idempotencyKeyFactory;

  final KombeApiClient _api;
  final ObligationIdResolver _obligationIdResolver;
  final ExpectedVersionResolver _expectedVersionResolver;
  final IdempotencyKeyFactory _idempotencyKeyFactory;

  @override
  Future<Resource<List<Contribution>>> listHistory({String? groupId}) async =>
      const ResourceFailure<List<Contribution>>(
        ClientFailure('route_absente_du_contrat'),
      );

  @override
  Future<Resource<Contribution>> getContribution(String contributionId) async =>
      const ResourceFailure<Contribution>(
        ClientFailure('route_absente_du_contrat'),
      );

  @override
  Future<OperationResult<Contribution>> submitDraft(
    ContributionDraft draft,
  ) async {
    final String? obligationId = _obligationIdResolver(draft);
    if (obligationId == null) {
      return const OperationFailure<Contribution>(
        ClientFailure('obligation_non_resolue'),
      );
    }
    final int? expectedVersion = _expectedVersionResolver(draft);
    if (expectedVersion == null || expectedVersion < 1) {
      return const OperationFailure<Contribution>(
        ClientFailure('version_attendue_absente'),
      );
    }
    final String idempotencyKey = _idempotencyKeyFactory(draft);
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return const OperationFailure<Contribution>(
        ClientFailure('cle_idempotence_invalide'),
      );
    }

    try {
      final ApiResponse res = await _api.post(
        '/groups/${draft.groupId}/contributions',
        <String, Object?>{
          'obligationId': obligationId,
          // Montant XAF entier strict (ADR-0002) : jamais de flottant sur le fil.
          'amount': draft.amountXaf,
        },
        headers: <String, String>{
          'Idempotency-Key': idempotencyKey,
          'If-Match-Version': '$expectedVersion',
        },
      );
      return OperationSuccess<Contribution>(_mapContribution(res.body));
    } on ApiFailure catch (e) {
      return OperationFailure<Contribution>(e);
    }
  }

  /// Mappe le schéma `Contribution` du contrat (contributionId, groupId,
  /// amount, state, version) vers l'entité. `channel` et `declaredAtUtc` ne
  /// sont PAS rendus par le serveur : ils restent null — le client ne les
  /// invente jamais (la date d'horodatage fait foi côté serveur, 18/ADR-0005).
  Contribution _mapContribution(Map<String, dynamic> json) {
    final Object? amount = json['amount'];
    if (amount is! int) {
      throw ApiFailure(statusCode: 200, code: 'RESPONSE_NOT_JSON');
    }
    return Contribution(
      id: json['contributionId'] as String,
      groupId: json['groupId'] as String,
      obligationId: json['obligationId'] as String? ?? '',
      amountXaf: amount,
      channel: null,
      status: _statusPourEtat(json['state'] as String),
      declaredAtUtc: null,
    );
  }

  static ContributionStatus _statusPourEtat(String state) =>
      switch (state) {
        'declared' => ContributionStatus.submitted,
        'validated' => ContributionStatus.validated,
        'rejected' => ContributionStatus.rejected,
        'compensated' => ContributionStatus.compensated,
        _ => throw ApiFailure(statusCode: 200, code: 'ETAT_INCONNU'),
      };
}
