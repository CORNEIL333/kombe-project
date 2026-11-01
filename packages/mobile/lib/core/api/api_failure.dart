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
  String toString() {
    // La raison française du serveur prime sur le code technique : sans cela,
    // les écrans (affichage en `error.toString()`) masquent le motif réel
    // (ex. « Envoi par SMS pas encore ouvert : connectez-vous par e-mail »).
    // Sans message serveur : jamais de code brut à l'écran, mais ce qui
    // s'est passé et ce que la personne peut faire (le code reste dans
    // [code] pour le diagnostic).
    final String m = message?.trim() ?? '';
    // Session : le message serveur (« Session non applicable ») est opaque.
    if (m.isEmpty || code == 'SESSION_INVALID' || code == 'UNAUTHENTICATED') return humanMessageFor(statusCode, code);
    return m;
  }

  /// La réponse ne nous est pas parvenue : l'opération a pu aboutir.
  bool get outcomeUnknown => statusCode == 0 || statusCode == 504;
}

/// Message lisible pour un échec sans explication du serveur.
String humanMessageFor(int statusCode, String code) {
  switch (code) {
    case 'NETWORK_ERROR':
      return 'Pas de connexion au serveur. Vérifiez votre réseau, puis réessayez.';
    case 'TIMEOUT':
      return 'Le serveur met trop de temps à répondre. Réessayez dans un instant.';
    case 'SESSION_INVALID':
    case 'UNAUTHENTICATED':
      return 'Votre session a expiré. Reconnectez-vous pour continuer.';
    case 'FORBIDDEN':
      return 'Cette action est réservée à une autre fonction du groupe.';
    case 'NOT_FOUND':
      return 'Cet élément n’existe plus ou ne vous est pas accessible.';
    case 'CONFLICT':
    case 'STATE_CONFLICT':
      return 'La situation a changé entre-temps. Actualisez, puis réessayez.';
    case 'RESPONSE_NOT_JSON':
      return 'Réponse inattendue du serveur. Réessayez dans un instant.';
  }
  if (statusCode >= 500) return 'Le serveur n’a pas pu traiter la demande. Réessayez dans un instant.';
  return 'L’opération n’a pas abouti. Réessayez ; si cela persiste, contactez le bureau du groupe.';
}

/// Garde-client non réseau (ex. portée de groupe indisponible pour une
/// lecture, ou obligation/version non résoluble pour une commande) : motif
/// stable, lisible, sans invention de route ni de paramètre.
final class ClientFailure implements Exception {
  const ClientFailure(this.reason);
  final String reason;

  /// [reason] reste pour le diagnostic ; l'écran reçoit une phrase.
  @override
  String toString() => 'Cette action n’est pas disponible depuis l’application pour le moment.';
}
