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
  bool get isNetwork => statusCode == 0 || code == 'NETWORK_ERROR' || code == 'TIMEOUT';

  @override
  String toString() => failureMessage(this);
}

/// Garde-client non réseau (ex. portée de groupe indisponible pour une
/// lecture, ou obligation/version non résoluble pour une commande) : motif
/// stable, lisible, sans invention de route ni de paramètre.
final class ClientFailure implements Exception {
  const ClientFailure(this.reason);
  final String reason;

  @override
  String toString() => reason;
}

/// Texte affiché quand le serveur KÓMBE ne répond pas.
const String networkFailureMessage = 'Pas de connexion au serveur KÓMBE. Vérifiez votre réseau et réessayez.';

/// Message français lisible pour n'importe quel échec : la raison française
/// du serveur prime toujours (`Error.message`) ; une coupure réseau donne un
/// texte clair ; jamais un code technique (`ApiFailure(0, NETWORK_ERROR)`).
String failureMessage(Object error) {
  if (error is ApiFailure) {
    if (error.isNetwork) return networkFailureMessage;
    final String m = error.message?.trim() ?? '';
    if (m.isNotEmpty) return m;
    return switch (error.statusCode) {
      401 => 'Votre session a expiré : reconnectez-vous.',
      403 => 'Cette action est réservée à une autre fonction du groupe.',
      404 => 'Élément introuvable : il a peut-être été retiré.',
      409 => 'La situation a changé entre-temps : actualisez puis réessayez.',
      422 || 400 => 'Les informations saisies ont été refusées par le serveur KÓMBE.',
      429 => 'Trop de demandes : patientez un instant puis réessayez.',
      >= 500 => 'Le serveur KÓMBE rencontre un problème. Réessayez dans un instant.',
      _ when error.code == 'RESPONSE_NOT_JSON' => 'Réponse inattendue du serveur KÓMBE. Réessayez dans un instant.',
      _ => 'Le serveur KÓMBE a refusé l’opération.',
    };
  }
  if (error is ClientFailure) return error.reason;
  final String s = '$error'.trim();
  return s.isEmpty ? 'Une erreur est survenue. Réessayez.' : s;
}
