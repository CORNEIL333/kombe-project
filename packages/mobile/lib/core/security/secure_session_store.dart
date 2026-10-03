import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Stores only opaque session material after the real backend is connected.
/// No credentials or business records are created by this client.
final class SecureSessionStore {
  const SecureSessionStore(this._storage);

  final FlutterSecureStorage _storage;

  static const String _sessionKey = 'auth.session';

  Future<void> writeOpaqueSession(String value) =>
      _storage.write(key: _sessionKey, value: value);

  Future<String?> readOpaqueSession() => _storage.read(key: _sessionKey);

  Future<void> clear() => _storage.delete(key: _sessionKey);
}
