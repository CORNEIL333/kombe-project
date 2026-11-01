import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stores only opaque session material after the real backend is connected.
/// No credentials or business records are created by this client.
///
/// Le coffre Android (Keystore) peut échouer sur un appareil réel : clé
/// perdue après une mise à jour ou une restauration, Keystore indisponible,
/// chiffrement illisible. Une telle panne ne doit JAMAIS bloquer la connexion :
/// lire était fait avant chaque requête, et une exception ici empêchait
/// l'appel de partir (aucune requête au serveur, connexion « qui échoue »).
/// La session est donc aussi gardée en mémoire : l'app reste connectée pour
/// la durée du processus même si le coffre refuse d'écrire, et une valeur
/// illisible est effacée puis traitée comme une absence de session.
final class SecureSessionStore {
  SecureSessionStore(this._storage);

  final FlutterSecureStorage _storage;

  static const String _sessionKey = 'auth.session';

  /// Copie de travail : `_loaded` distingue « pas encore lu » de « absent ».
  String? _memory;
  bool _loaded = false;

  Future<void> writeOpaqueSession(String value) async {
    _memory = value;
    _loaded = true;
    try {
      await _storage.write(key: _sessionKey, value: value);
    } catch (_) {
      // Coffre indisponible : la session vit en mémoire jusqu'à la fermeture
      // de l'app (une nouvelle connexion sera demandée au prochain lancement).
    }
  }

  Future<String?> readOpaqueSession() async {
    if (_loaded) return _memory;
    try {
      _memory = await _storage.read(key: _sessionKey);
    } catch (_) {
      _memory = null;
      try {
        await _storage.delete(key: _sessionKey);
      } catch (_) {
        // Rien de plus à faire : la valeur illisible sera ignorée.
      }
    }
    _loaded = true;
    return _memory;
  }

  Future<void> clear() async {
    _memory = null;
    _loaded = true;
    try {
      await _storage.delete(key: _sessionKey);
    } catch (_) {
      // Effacement local best-effort ; la mémoire est déjà purgée.
    }
  }
}
