import '../../core/api/api_failure.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../domain/entities/contribution.dart';
import '../../domain/repositories/contribution_repository.dart';
import 'kombe_api_client.dart';

/// Résolution de l'identifiant d'obligation d'une cotisation : le contrat réel
/// `POST /groups/{groupId}/declarations` exige `obligationId`, que le brouillon
/// local ne porte pas (il appartient au calendrier serveur). Fourni par
/// l'appelant ; `null` = non résoluble → le client refuse au lieu d'inventer.
typedef ObligationIdResolver = String? Function(ContributionDraft draft);

/// Version d'objet attendue pour la mutation (concurrence optimiste, 18.2) :
/// portée par l'en-tête `If-Match-Version`. Non stockée dans le brouillon :
/// elle provient de la vue d'obligation serveur. `null`/`< 1` → refus client.
typedef ExpectedVersionResolver = int? Function(ContributionDraft draft);

/// Fabrique de clé d'idempotence (8..200) : un rejeu du même envoi doit
/// réutiliser la même clé. Fournie par l'appelant (session/file d'attente),
/// jamais devinée.
typedef IdempotencyKeyFactory = String Function(ContributionDraft draft);

/// Date alléguée du paiement (`allegedDate`, format `YYYY-MM-DD` du contrat) :
/// saisie/fournie par l'appelant, JAMAIS devinée ni horodatée d'office côté
/// client (l'horodatage serveur fait foi, règle 18 / ADR-0005). `null` = non
/// résolue → refus client avant tout appel réseau.
typedef AllegedDateResolver = String? Function(ContributionDraft draft);

/// Implémentation HTTP réelle de [ContributionRepository], branchée sur la
/// SEULE route d'écriture réellement persistée en base (Piste A3, prouvée par
/// `packages/api/test/serverRealMode.proof.mjs`) :
///
/// - `POST /groups/{groupId}/declarations` — déclaration idempotente
///   (`Idempotency-Key` + `If-Match-Version` obligatoires, montant entier XAF,
///   jamais de flottant, ADR-0002 ; `channel` ∈ {cash, electronic} ;
///   `allegedDate` au format date). La réponse est un REÇU de commande
///   (`commandId`, `status` applied|duplicate, `resultVersion`, `eventHash`,
///   `remainingDue`, `availableToDeclare`) — pas une ressource `Contribution` :
///   le reçu est projeté honnêtement sur l'entité (voir [_mapReceipt]).
///
/// La route `POST /groups/{groupId}/contributions` n'est PAS utilisée : elle
/// repose sur le store agrégé FICTIF (mémoire) et non sur Postgres — l'employer
/// serait de la simulation, ce que ce dépôt refuse.
///
/// - LECTURE (historique / détail) : AUCUNE route de lecture de cotisation
///   n'existe dans le contrat → le dépôt le dit honnêtement ([ClientFailure])
///   au lieu d'inventer un endpoint ou de fabriquer des données.
final class HttpContributionRepository implements ContributionRepository {
  HttpContributionRepository({
    required KombeApiClient api,
    required ObligationIdResolver obligationIdResolver,
    required ExpectedVersionResolver expectedVersionResolver,
    required IdempotencyKeyFactory idempotencyKeyFactory,
    required AllegedDateResolver allegedDateResolver,
  })  : _api = api,
        _obligationIdResolver = obligationIdResolver,
        _expectedVersionResolver = expectedVersionResolver,
        _idempotencyKeyFactory = idempotencyKeyFactory,
        _allegedDateResolver = allegedDateResolver;

  final KombeApiClient _api;
  final ObligationIdResolver _obligationIdResolver;
  final ExpectedVersionResolver _expectedVersionResolver;
  final IdempotencyKeyFactory _idempotencyKeyFactory;
  final AllegedDateResolver _allegedDateResolver;

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
    final String? allegedDate = _allegedDateResolver(draft);
    if (allegedDate == null || allegedDate.isEmpty) {
      return const OperationFailure<Contribution>(
        ClientFailure('date_alleguee_absente'),
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
        '/groups/${draft.groupId}/declarations',
        <String, Object?>{
          'obligationId': obligationId,
          // Montant XAF entier strict (ADR-0002) : jamais de flottant sur le fil.
          'amount': draft.amountXaf,
          'channel': _channelApi(draft.channel),
          'allegedDate': allegedDate,
        },
        headers: <String, String>{
          'Idempotency-Key': idempotencyKey,
          'If-Match-Version': '$expectedVersion',
        },
      );
      return OperationSuccess<Contribution>(
        _mapReceipt(res.body, draft),
      );
    } on ApiFailure catch (e) {
      return OperationFailure<Contribution>(e);
    }
  }

  /// Canal du contrat réel : `cash` | `electronic`. Le mobile-money et le
  /// virement bancaire sont tous deux électroniques ; seul l'espèce est cash.
  static String _channelApi(PaymentChannel channel) => switch (channel) {
        PaymentChannel.cash => 'cash',
        PaymentChannel.mobileMoney => 'electronic',
        PaymentChannel.bankTransfer => 'electronic',
      };

  /// Projette le REÇU de déclaration réelle sur l'entité [Contribution]. Le
  /// reçu ne rend ni `contributionId` ressource, ni canal, ni horodatage : on
  /// utilise le `commandId` serveur (identifiant réel de la commande scellée en
  /// base) comme `id`, on reprend le montant/canal envoyés (connus, non
  /// inventés), et `declaredAtUtc` reste null — l'horodatage serveur fait foi
  /// (règle 18 / ADR-0005), le client ne le fabrique jamais.
  Contribution _mapReceipt(Map<String, dynamic> json, ContributionDraft draft) {
    final Object? commandId = json['commandId'];
    final Object? status = json['status'];
    if (commandId is! String || status is! String) {
      throw ApiFailure(statusCode: 200, code: 'RESPONSE_NOT_JSON');
    }
    return Contribution(
      id: commandId,
      groupId: draft.groupId,
      obligationId: json['obligationId'] as String? ?? '',
      amountXaf: draft.amountXaf,
      channel: draft.channel,
      status: _statusPourRecu(status),
      declaredAtUtc: null,
    );
  }

  static ContributionStatus _statusPourRecu(String status) =>
      switch (status) {
        // `applied` = événement scellé ; `duplicate` = rejeu idempotent du même
        // envoi (même reçu d'origine). Les deux = cotisation soumise côté client.
        'applied' => ContributionStatus.submitted,
        'duplicate' => ContributionStatus.submitted,
        _ => throw ApiFailure(statusCode: 200, code: 'ETAT_INCONNU'),
      };
}
