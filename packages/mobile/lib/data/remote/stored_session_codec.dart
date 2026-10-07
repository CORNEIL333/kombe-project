import 'dart:convert';

/// Encodage/décodage de la session persistée par [SecureSessionStore] (qui ne
/// stocke qu'une chaîne opaque, sans l'interpréter). Le `sessionId` est le
/// secret transporté (jamais loggué) ; `identityId`/`expiresAtUtc` ne sont PAS
/// des secrets mais doivent survivre un redémarrage pour reconstruire
/// [AuthSession] sans rappeler le serveur. Partagé par [HttpAuthRepository]
/// (écriture/lecture de session) et la fabrique d'en-têtes de
/// [KombeApiClient] (lecture seule, `Authorization: Bearer <sessionId>`).
final class StoredSession {
  const StoredSession({
    required this.sessionId,
    required this.identityId,
    required this.expiresAtUtc,
  });

  final String sessionId;
  final String identityId;
  final DateTime expiresAtUtc;

  bool get isExpired => expiresAtUtc.isBefore(DateTime.now().toUtc());
}

String encodeStoredSession(StoredSession session) =>
    jsonEncode(<String, Object?>{
      'sessionId': session.sessionId,
      'identityId': session.identityId,
      'expiresAtUtc': session.expiresAtUtc.toIso8601String(),
    });

/// `null` si la valeur est absente, corrompue, ou structurellement invalide —
/// jamais une exception propagée (une session illisible se traite comme une
/// absence de session, pas comme une erreur fatale au démarrage).
StoredSession? decodeStoredSession(String? raw) {
  if (raw == null) return null;
  try {
    final Object? decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) return null;
    final Object? sessionId = decoded['sessionId'];
    final Object? identityId = decoded['identityId'];
    final Object? expiresAtUtc = decoded['expiresAtUtc'];
    if (sessionId is! String ||
        identityId is! String ||
        expiresAtUtc is! String) {
      return null;
    }
    return StoredSession(
      sessionId: sessionId,
      identityId: identityId,
      expiresAtUtc: DateTime.parse(expiresAtUtc),
    );
  } catch (_) {
    return null;
  }
}
