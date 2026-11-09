import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:kombe_mobile/core/api/api_failure.dart';
import 'package:kombe_mobile/data/remote/kombe_api_client.dart';

void main() {
  test('un 401 déclenche onUnauthorized puis lèvre une ApiFailure', () async {
    bool purged = false;
    final KombeApiClient api = KombeApiClient(
      baseUrl: Uri.parse('https://essai.invalid/v1'),
      client: MockClient((http.Request request) async => http.Response('{"code":"SESSION_INVALIDE","message":"session expirée"}', 401)),
      onUnauthorized: () async => purged = true,
    );
    await expectLater(api.get('/me'), throwsA(isA<ApiFailure>().having((ApiFailure f) => f.statusCode, 'status', 401)));
    expect(purged, isTrue);
  });

  test('un autre échec ne déclenche pas onUnauthorized', () async {
    bool purged = false;
    final KombeApiClient api = KombeApiClient(
      baseUrl: Uri.parse('https://essai.invalid/v1'),
      client: MockClient((http.Request request) async => http.Response('{"code":"OBJET_INTROUVABLE"}', 404)),
      onUnauthorized: () async => purged = true,
    );
    await expectLater(api.get('/tontines/x'), throwsA(isA<ApiFailure>().having((ApiFailure f) => f.statusCode, 'status', 404)));
    expect(purged, isFalse);
  });
}
