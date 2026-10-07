import 'dart:async';

import '../../core/api/api_failure.dart';
import '../../core/security/secure_session_store.dart';
import '../../core/state/operation_result.dart';
import '../../core/state/resource.dart';
import '../../domain/entities/auth.dart';
import '../../domain/repositories/auth_repository.dart';
import 'kombe_api_client.dart';
import 'stored_session_codec.dart';

/// Implémentation HTTP réelle de [AuthRepository] (ADR-0024, Piste A3 suite) :
/// branchée EXACTEMENT sur les routes déjà prouvées base réelle
/// (`docs/PREUVES_PISTE_A3_SERVEUR.md`) : `/access/registrations(/verifications)`,
/// `/access/login-requests`, `/access/login-completions`,
/// `/access/recovery-requests`, `/access/recovery-completions`. Email est le
/// SEUL canal (`channel: 'email'`, D05 — SMS écarté pour ce premier
/// déploiement) : jamais exposé au-delà de ce fichier.
///
/// `sessionId` est TOUJOURS celui renvoyé par le serveur (`completeLogin`),
/// jamais choisi ici. Persisté via [SecureSessionStore] sous une forme
/// composite (`stored_session_codec.dart`) pour survivre un redémarrage sans
/// rappeler le serveur — [KombeApiClient] lit la MÊME valeur (fabrique d'
/// en-têtes fournie par l'appelant, `app_dependencies.dart`).
final class HttpAuthRepository implements AuthRepository {
  HttpAuthRepository({
    required KombeApiClient api,
    required SecureSessionStore sessionStore,
  }) : _api = api,
       _sessionStore = sessionStore {
    unawaited(_hydrate());
  }

  final KombeApiClient _api;
  final SecureSessionStore _sessionStore;
  final StreamController<Resource<AuthSession?>> _updates =
      StreamController<Resource<AuthSession?>>.broadcast();

  // Dernier état connu, pour qu'un abonné qui arrive APRÈS l'hydratation
  // (cas normal : `SessionController.start()` peut s'abonner après que la
  // lecture asynchrone du stockage sécurisé a déjà abouti) reçoive quand
  // même l'état courant, jamais seulement les mises à jour futures — un
  // `StreamController.broadcast` seul ne rejoue rien à un abonné tardif.
  Resource<AuthSession?> _current = const ResourceLoading<AuthSession?>();

  void _publish(Resource<AuthSession?> next) {
    _current = next;
    _updates.add(next);
  }

  Future<void> _hydrate() async {
    final StoredSession? stored = decodeStoredSession(
      await _sessionStore.readOpaqueSession(),
    );
    _publish(ResourceReady<AuthSession?>(_sessionFrom(stored)));
  }

  static AuthSession? _sessionFrom(StoredSession? stored) {
    if (stored == null || stored.isExpired) return null;
    return AuthSession(
      identityId: stored.identityId,
      accountStatus: AccountStatus.active,
      expiresAtUtc: stored.expiresAtUtc,
    );
  }

  @override
  Stream<Resource<AuthSession?>> watchSession() =>
      Stream<Resource<AuthSession?>>.multi((controller) {
        controller.add(_current);
        final StreamSubscription<Resource<AuthSession?>> sub = _updates.stream
            .listen(controller.add);
        controller.onCancel = sub.cancel;
      });

  @override
  Future<OperationResult<void>> requestRegistration(String identityId) async {
    try {
      await _api.post('/access/registrations', <String, Object?>{
        'identityId': identityId,
        'channel': 'email',
      });
      return const OperationSuccess<void>(null);
    } on ApiFailure catch (e) {
      return OperationFailure<void>(e);
    }
  }

  @override
  Future<OperationResult<AccountStatus>> verifyRegistration({
    required String identityId,
    required String code,
  }) async {
    try {
      final ApiResponse res = await _api.post(
        '/access/registrations/verifications',
        <String, Object?>{'identityId': identityId, 'code': code},
      );
      final Object? state = res.body['state'];
      if (state is! String)
        throw ApiFailure(statusCode: res.statusCode, code: 'RESPONSE_NOT_JSON');
      return OperationSuccess<AccountStatus>(_statusFrom(state));
    } on ApiFailure catch (e) {
      return OperationFailure<AccountStatus>(e);
    }
  }

  @override
  Future<OperationResult<void>> requestLogin(String identityId) async {
    try {
      await _api.post('/access/login-requests', <String, Object?>{
        'identityId': identityId,
      });
      return const OperationSuccess<void>(null);
    } on ApiFailure catch (e) {
      return OperationFailure<void>(e);
    }
  }

  @override
  Future<OperationResult<AuthSession>> completeLogin({
    required String identityId,
    required String code,
  }) async {
    try {
      final ApiResponse res = await _api.post(
        '/access/login-completions',
        <String, Object?>{'identityId': identityId, 'code': code},
      );
      final Object? sessionId = res.body['sessionId'];
      final Object? expiresAt = res.body['expiresAt'];
      if (sessionId is! String || expiresAt is! int) {
        throw ApiFailure(statusCode: res.statusCode, code: 'RESPONSE_NOT_JSON');
      }
      final DateTime expiresAtUtc = DateTime.fromMillisecondsSinceEpoch(
        expiresAt,
        isUtc: true,
      );
      await _sessionStore.writeOpaqueSession(
        encodeStoredSession(
          StoredSession(
            sessionId: sessionId,
            identityId: identityId,
            expiresAtUtc: expiresAtUtc,
          ),
        ),
      );
      final AuthSession session = AuthSession(
        identityId: identityId,
        accountStatus: AccountStatus.active,
        expiresAtUtc: expiresAtUtc,
      );
      _publish(ResourceReady<AuthSession?>(session));
      return OperationSuccess<AuthSession>(session);
    } on ApiFailure catch (e) {
      return OperationFailure<AuthSession>(e);
    }
  }

  @override
  Future<OperationResult<void>> requestRecovery(String identityId) async {
    try {
      await _api.post('/access/recovery-requests', <String, Object?>{
        'identityId': identityId,
      });
      return const OperationSuccess<void>(null);
    } on ApiFailure catch (e) {
      return OperationFailure<void>(e);
    }
  }

  @override
  Future<OperationResult<void>> completeRecovery({
    required String identityId,
    required String code,
  }) async {
    try {
      await _api.post('/access/recovery-completions', <String, Object?>{
        'identityId': identityId,
        'code': code,
      });
      return const OperationSuccess<void>(null);
    } on ApiFailure catch (e) {
      return OperationFailure<void>(e);
    }
  }

  @override
  Future<OperationResult<void>> signOut() async {
    await _sessionStore.clear();
    _publish(const ResourceReady<AuthSession?>(null));
    return const OperationSuccess<void>(null);
  }

  static AccountStatus _statusFrom(String state) => switch (state) {
    'active' => AccountStatus.active,
    'suspended' => AccountStatus.suspended,
    _ => AccountStatus.pendingVerification,
  };
}
