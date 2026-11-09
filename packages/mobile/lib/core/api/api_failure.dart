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

  /// Vrai quand aucune réponse n'est arrivée du serveur (réseau, délai).
  bool get isNetwork => code == 'NETWORK_ERROR' || code == 'TIMEOUT' || (statusCode == 0 && code != 'CLIENT_ERROR');

  @override
  String toString() => failureMessage(this);

  /// La réponse ne nous est pas parvenue : l'opération a pu aboutir.
  bool get outcomeUnknown => statusCode == 0 || statusCode == 504;
}

/// Garde-client non réseau (ex. portée de groupe indisponible pour une
/// lecture, ou obligation/version non résoluble pour une commande) : motif
/// stable, lisible, sans invention de route ni de paramètre.
final class ClientFailure implements Exception {
  const ClientFailure(this.reason);
  final String reason;

  /// [reason] est une phrase française lisible, affichée telle quelle.
  @override
  String toString() => reason;
}

/// Texte affiché quand le serveur KÓMBE ne répond pas.
const String networkFailureMessage = 'Pas de connexion au serveur KÓMBE. Vérifiez votre réseau et réessayez.';

/// Message français lisible pour n'importe quel échec : la raison française
/// du serveur prime toujours (`Error.message`), sauf pour une session
/// expirée (message serveur opaque) ; une coupure réseau donne un texte
/// clair ; jamais un code technique (`ApiFailure(0, NETWORK_ERROR)`).
String failureMessage(Object error) {
  if (error is ApiFailure) {
    if (error.isNetwork) {
      return error.code == 'TIMEOUT' ? humanMessageFor(error.statusCode, error.code) : networkFailureMessage;
    }
    final String m = error.message?.trim() ?? '';
    if (m.isNotEmpty && error.code != 'SESSION_INVALID' && error.code != 'UNAUTHENTICATED') return m;
    return humanMessageFor(error.statusCode, error.code);
  }
  if (error is ClientFailure) return error.reason;
  final String s = '$error'.trim();
  return s.isEmpty ? 'Une erreur est survenue. Réessayez.' : s;
}

/// Message lisible pour un échec sans explication du serveur (le code reste
/// dans [ApiFailure.code] pour le diagnostic).
String humanMessageFor(int statusCode, String code) {
  switch (code) {
    case 'NETWORK_ERROR':
      return networkFailureMessage;
    case 'TIMEOUT':
      return 'Le serveur KÓMBE met trop de temps à répondre. Réessayez dans un instant.';
    case 'SESSION_INVALID':
    case 'UNAUTHENTICATED':
      return 'Votre session a expiré : reconnectez-vous pour continuer.';
    case 'FORBIDDEN':
      return 'Cette action est réservée à une autre fonction du groupe.';
    case 'NOT_FOUND':
      return 'Élément introuvable : il a peut-être été retiré.';
    case 'CONFLICT':
    case 'STATE_CONFLICT':
      return 'La situation a changé entre-temps : actualisez puis réessayez.';
    case 'RESPONSE_NOT_JSON':
      return 'Réponse inattendue du serveur KÓMBE. Réessayez dans un instant.';
  }
  return switch (statusCode) {
    401 => 'Votre session a expiré : reconnectez-vous pour continuer.',
    403 => 'Cette action est réservée à une autre fonction du groupe.',
    404 => 'Élément introuvable : il a peut-être été retiré.',
    409 => 'La situation a changé entre-temps : actualisez puis réessayez.',
    422 || 400 => 'Les informations saisies ont été refusées par le serveur KÓMBE.',
    429 => 'Trop de demandes : patientez un instant puis réessayez.',
    >= 500 => 'Le serveur KÓMBE rencontre un problème. Réessayez dans un instant.',
    _ => 'L’opération n’a pas abouti. Réessayez ; si cela persiste, contactez le bureau du groupe.',
  };
}
