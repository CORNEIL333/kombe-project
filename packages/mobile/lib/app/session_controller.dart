import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/state/resource.dart';
import '../domain/entities/auth.dart';
import '../domain/repositories/auth_repository.dart';

enum SessionStateKind { loading, unavailable, signedOut, signedIn }

final class SessionController extends ChangeNotifier {
  SessionController(this._repository);

  final AuthRepository _repository;
  StreamSubscription<Resource<AuthSession?>>? _subscription;

  SessionStateKind _kind = SessionStateKind.loading;
  AuthSession? _session;

  SessionStateKind get kind => _kind;
  AuthSession? get session => _session;

  void start() {
    _subscription?.cancel();
    _subscription = _repository.watchSession().listen((Resource<AuthSession?> resource) {
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
      notifyListeners();
    });
  }

  @override
  void dispose() {
    unawaited(_subscription?.cancel());
    super.dispose();
  }
}
