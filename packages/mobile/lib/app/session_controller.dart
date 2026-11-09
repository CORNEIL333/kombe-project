import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/state/resource.dart';
import '../domain/entities/auth.dart';
import '../domain/entities/profile.dart';
import '../domain/repositories/auth_repository.dart';
import '../domain/repositories/profile_repository.dart';

enum SessionStateKind { loading, unavailable, signedOut, signedIn }

final class SessionController extends ChangeNotifier {
  SessionController(this._repository, {ProfileRepository? profileRepository}) : _profiles = profileRepository;

  final AuthRepository _repository;
  final ProfileRepository? _profiles;
  StreamSubscription<Resource<AuthSession?>>? _subscription;
  bool _disposed = false;

  SessionStateKind _kind = SessionStateKind.loading;
  AuthSession? _session;
  bool _needsDisplayName = false;

  SessionStateKind get kind => _kind;
  AuthSession? get session => _session;

  /// Vrai quand le compte n'a pas encore de nom (`GET /v1/me` sans
  /// `displayName`) : l'application le demande avant d'entrer.
  bool get needsDisplayName => _needsDisplayName;

  void start() {
    _subscription?.cancel();
    _subscription = _repository.watchSession().listen((Resource<AuthSession?> resource) {
      final String? previous = _session?.identityId;
      switch (resource) {
        case ResourceLoading<AuthSession?>():
          _kind = SessionStateKind.loading;
          _session = null;
        case ResourceUnavailable<AuthSession?>():
          _kind = SessionStateKind.unavailable;
          _session = null;
        case ResourceFailure<AuthSession?>():
          _kind = SessionStateKind.signedOut;
          _session = null;
        case ResourceReady<AuthSession?>(:final data):
          _session = data;
          _kind = data == null ? SessionStateKind.signedOut : SessionStateKind.signedIn;
      }
      if (_session == null) _needsDisplayName = false;
      _notify();
      final String? current = _session?.identityId;
      if (current != null && current != previous) unawaited(_checkDisplayName(current));
    });
  }

  Future<void> _checkDisplayName(String identityId) async {
    final ProfileRepository? profiles = _profiles;
    if (profiles == null) return;
    final Resource<UserProfile> profile = await profiles.loadProfile();
    // Réseau indisponible : on ne bloque pas l'entrée, la question reviendra.
    if (profile case ResourceReady<UserProfile>(:final UserProfile data)) {
      if (_session?.identityId != identityId) return;
      final bool missing = data.displayName.trim().isEmpty;
      if (missing != _needsDisplayName) {
        _needsDisplayName = missing;
        _notify();
      }
    }
  }

  /// Le nom vient d'être enregistré (`PATCH /v1/me`) : on entre dans l'app.
  void displayNameSaved() {
    _needsDisplayName = false;
    _notify();
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    unawaited(_subscription?.cancel());
    super.dispose();
  }
}
