/// Échec d'appel conforme au contrat OpenAPI : `code` est l'ErrorCode STABLE
/// servi par le serveur dans `Error{code, message, traceId}`, ou un code client
/// explicite quand la réponse elle-même est invalide (`RESPONSE_NOT_JSON`,
/// `TIMEOUT`). Aucune donnée serveur n'est réinterprétée silencieusement.
final class ApiFailure implements Exception {
  const ApiFailure({
    required this.statusCode,
    required this.code,
    this.message,
    this.traceId,
  });

  /// Statut HTTP ; 0 = pas de réponse (réseau/timeout).
  final int statusCode;
  final String code;
  final String? message;
  final String? traceId;

  @override
  String toString() => 'ApiFailure($statusCode, $code)';
}

/// Garde-client non réseau (ex. portée de groupe indisponible pour une
/// lecture, ou obligation/version non résoluble pour une commande) : motif
/// stable, lisible, sans invention de route ni de paramètre.
final class ClientFailure implements Exception {
  const ClientFailure(this.reason);
  final String reason;

  @override
  String toString() => 'ClientFailure($reason)';
}
