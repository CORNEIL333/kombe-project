import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kombe_mobile/core/api/api_failure.dart';
import 'package:kombe_mobile/core/security/secure_session_store.dart';
import 'package:kombe_mobile/core/state/operation_result.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/data/remote/http_auth_repository.dart';
import 'package:kombe_mobile/data/remote/kombe_api_client.dart';
import 'package:kombe_mobile/domain/entities/auth.dart';

/// Double EN MÉMOIRE du canal plateforme `flutter_secure_storage` (motif
/// fédéré standard : `FlutterSecureStoragePlatform.instance = ...`, pas un
/// mock de méthode privée) — aucun plugin natif requis en test.
final class _InMemorySecureStoragePlatform
    extends FlutterSecureStoragePlatform {
  final Map<String, String> _store = <String, String>{};

  @override
  Future<void> write({
    required String key,
    required String value,
    required Map<String, String> options,
  }) async {
    _store[key] = value;
  }

  @override
  Future<String?> read({
    required String key,
    required Map<String, String> options,
  }) async => _store[key];

  @override
  Future<bool> containsKey({
    required String key,
    required Map<String, String> options,
  }) async => _store.containsKey(key);

  @override
  Future<void> delete({
    required String key,
    required Map<String, String> options,
  }) async {
    _store.remove(key);
  }

  @override
  Future<Map<String, String>> readAll({
    required Map<String, String> options,
  }) async => Map.of(_store);

  @override
  Future<void> deleteAll({required Map<String, String> options}) async =>
      _store.clear();
}

/// Recettes CONTRACTUELLES du dépôt d'accès RÉEL (ADR-0024, Piste A3 suite) :
/// seules les routes déjà prouvées base réelle sont appelées
/// (`docs/PREUVES_PISTE_A3_SERVEUR.md`), `sessionId` est TOUJOURS celui
/// renvoyé par le serveur (jamais fabriqué), et la session persistée survit
/// une "redémarrage" (nouvelle instance du dépôt, même stockage).
/// `MockClient` = frontière HTTP simulée ; double en mémoire pour le
/// stockage sécurisé — AUCUN serveur ni plugin natif requis.
void main() {
  late _InMemorySecureStoragePlatform platform;

  setUp(() {
    platform = _InMemorySecureStoragePlatform();
    FlutterSecureStoragePlatform.instance = platform;
  });

  HttpAuthRepository repoFor(
    Future<http.Response> Function(http.Request) handler,
  ) {
    return HttpAuthRepository(
      api: KombeApiClient(
        baseUrl: Uri.parse('https://api.kombe.test/v1'),
        client: MockClient((req) async => handler(req)),
      ),
      sessionStore: const SecureSessionStore(FlutterSecureStorage()),
    );
  }

  group('requestRegistration → POST /access/registrations', () {
    test('porte identityId et channel=email, jamais autre chose', () async {
      late http.Request captured;
      final repo = repoFor((req) async {
        captured = req;
        return http.Response(jsonEncode({'accepted': true}), 202);
      });

      final result = await repo.requestRegistration('alice@example.test');

      expect(captured.method, 'POST');
      expect(captured.url.path, '/v1/access/registrations');
      final body = jsonDecode(captured.body) as Map<String, dynamic>;
      expect(body, {'identityId': 'alice@example.test', 'channel': 'email'});
      expect(result, isA<OperationSuccess<void>>());
    });
  });

  group('verifyRegistration → POST /access/registrations/verifications', () {
    test('code correct → état actif', () async {
      final repo = repoFor(
        (_) async => http.Response(jsonEncode({'state': 'active'}), 200),
      );
      final result = await repo.verifyRegistration(
        identityId: 'alice@example.test',
        code: '123456',
      );
      expect(result, isA<OperationSuccess<AccountStatus>>());
      expect(
        (result as OperationSuccess<AccountStatus>).value,
        AccountStatus.active,
      );
    });

    test(
      'code erroné (400 TOKEN_INVALID) → ErrorCode stable propagé',
      () async {
        final repo = repoFor(
          (_) async => http.Response(
            jsonEncode({'code': 'TOKEN_INVALID', 'message': 'Refusé'}),
            400,
          ),
        );
        final result = await repo.verifyRegistration(
          identityId: 'alice@example.test',
          code: '000000',
        );
        expect(result, isA<OperationFailure<AccountStatus>>());
        final err =
            (result as OperationFailure<AccountStatus>).error as ApiFailure;
        expect(err.statusCode, 400);
        expect(err.code, 'TOKEN_INVALID');
      },
    );
  });

  group('requestLogin → POST /access/login-requests', () {
    test(
      'porte seulement identityId (aucun sessionId choisi par le client)',
      () async {
        late http.Request captured;
        final repo = repoFor((req) async {
          captured = req;
          return http.Response(jsonEncode({'accepted': true}), 202);
        });
        await repo.requestLogin('alice@example.test');
        expect(captured.url.path, '/v1/access/login-requests');
        final body = jsonDecode(captured.body) as Map<String, dynamic>;
        expect(body, {'identityId': 'alice@example.test'});
      },
    );
  });

  group('completeLogin → POST /access/login-completions', () {
    test('sessionId SERVEUR persisté + diffusé via watchSession', () async {
      final repo = repoFor(
        (_) async => http.Response(
          jsonEncode({
            'sessionId': 'sess-real-xyz',
            'expiresAt': 4102444800000,
          }),
          201,
        ),
      );

      final sessions = <Resource<AuthSession?>>[];
      final sub = repo.watchSession().listen(sessions.add);

      final result = await repo.completeLogin(
        identityId: 'alice@example.test',
        code: '123456',
      );
      expect(result, isA<OperationSuccess<AuthSession>>());
      final session = (result as OperationSuccess<AuthSession>).value;
      expect(session.identityId, 'alice@example.test');
      expect(session.accountStatus, AccountStatus.active);

      await Future<void>.delayed(Duration.zero);
      expect(sessions.last, isA<ResourceReady<AuthSession?>>());
      expect(
        (sessions.last as ResourceReady<AuthSession?>).data?.identityId,
        'alice@example.test',
      );
      await sub.cancel();

      // Persisté : une NOUVELLE instance (même stockage) voit la session.
      // Écoute posée AVANT tout `await` : un flux broadcast ne rejoue rien à
      // un abonné tardif, l'hydratation (micro-tâche dès la construction)
      // doit donc trouver un abonné déjà en place.
      final rehydrated = repoFor((_) async => http.Response('{}', 200));
      final hydratedSessions = <Resource<AuthSession?>>[];
      final sub2 = rehydrated.watchSession().listen(hydratedSessions.add);
      await Future<void>.delayed(Duration.zero);
      expect(
        (hydratedSessions.last as ResourceReady<AuthSession?>).data?.identityId,
        'alice@example.test',
      );
      await sub2.cancel();
    });

    test(
      'code erroné (401 SESSION_INVALID) → aucune session persistée',
      () async {
        final repo = repoFor(
          (_) async => http.Response(
            jsonEncode({'code': 'SESSION_INVALID', 'message': 'Refusé'}),
            401,
          ),
        );
        final result = await repo.completeLogin(
          identityId: 'alice@example.test',
          code: '000000',
        );
        expect(result, isA<OperationFailure<AuthSession>>());
        expect(platform._store, isEmpty);
      },
    );
  });

  group('requestRecovery / completeRecovery — ne délivrent PAS de session', () {
    test('completeRecovery réussi ne persiste aucun sessionId', () async {
      final repo = repoFor(
        (_) async => http.Response(
          jsonEncode({'sessionGeneration': 2, 'recoveryLockUntil': null}),
          200,
        ),
      );
      final result = await repo.completeRecovery(
        identityId: 'alice@example.test',
        code: '123456',
      );
      expect(result, isA<OperationSuccess<void>>());
      expect(platform._store, isEmpty);
    });
  });

  group('signOut', () {
    test('efface la session persistée et diffuse signedOut', () async {
      final repo = repoFor(
        (_) async => http.Response(
          jsonEncode({
            'sessionId': 'sess-real-xyz',
            'expiresAt': 4102444800000,
          }),
          201,
        ),
      );
      await repo.completeLogin(
        identityId: 'alice@example.test',
        code: '123456',
      );
      expect(platform._store, isNotEmpty);

      final sessions = <Resource<AuthSession?>>[];
      final sub = repo.watchSession().listen(sessions.add);
      await repo.signOut();
      await Future<void>.delayed(Duration.zero);

      expect(platform._store, isEmpty);
      expect((sessions.last as ResourceReady<AuthSession?>).data, isNull);
      await sub.cancel();
    });
  });
}
