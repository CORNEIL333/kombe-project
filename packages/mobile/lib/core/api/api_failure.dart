import '../../l10n/kombe_l10n.dart';

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
String get networkFailureMessage => KombeL10n.current.afPasDeConnexionAuServeur;

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
  return s.isEmpty ? KombeL10n.current.afUneErreurEstSurvenueReessayez : s;
}

/// Message lisible pour un échec sans explication du serveur (le code reste
/// dans [ApiFailure.code] pour le diagnostic).
String humanMessageFor(int statusCode, String code) {
  switch (code) {
    case 'NETWORK_ERROR':
      return networkFailureMessage;
    case 'TIMEOUT':
      return KombeL10n.current.afLeServeurKombeMetTrop;
    case 'SESSION_INVALID':
    case 'UNAUTHENTICATED':
      return KombeL10n.current.afVotreSessionExpireReconnectezVous;
    case 'FORBIDDEN':
      return KombeL10n.current.afCetteActionEstReserveeUne;
    case 'NOT_FOUND':
      return KombeL10n.current.afElementIntrouvableIlPeutEtre;
    case 'CONFLICT':
    case 'STATE_CONFLICT':
      return KombeL10n.current.afLaSituationChangeEntreTemps;
    case 'RESPONSE_NOT_JSON':
      return KombeL10n.current.afReponseInattendueDuServeurKombe;
  }
  return switch (statusCode) {
    401 => KombeL10n.current.afVotreSessionExpireReconnectezVous,
    403 => KombeL10n.current.afCetteActionEstReserveeUne,
    404 => KombeL10n.current.afElementIntrouvableIlPeutEtre,
    409 => KombeL10n.current.afLaSituationChangeEntreTemps,
    422 || 400 => KombeL10n.current.afLesInformationsSaisiesOntEte,
    429 => KombeL10n.current.afTropDeDemandesPatientezUn,
    >= 500 => KombeL10n.current.afLeServeurKombeRencontreUn,
    _ => KombeL10n.current.afLoperationNaPasAboutiReessayez,
  };
}
