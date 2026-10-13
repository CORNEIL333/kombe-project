import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/api/api_failure.dart';

/// En-têtes de session injectés à chaque appel (jeton, etc.). Fournis par
/// l'appelant — le transport ne stocke aucun secret lui-même et ne logge
/// jamais ces en-têtes.
typedef SessionHeaders = Future<Map<String, String>> Function();

/// Résultat brut d'un appel réussi (2xx) : statut HTTP + corps JSON décodé.
final class ApiResponse {
  const ApiResponse({required this.statusCode, required this.body});
  final int statusCode;
  final Map<String, dynamic> body;
}

/// Transport JSON minimal vers l'API KÓMBE (préfixe `/v1` du contrat OpenAPI,
/// résolu depuis la configuration — jamais deviné).
///
/// Aucune logique métier : il exécute la requête, porte la session et traduit
/// la réponse en données structurées. Les décisions (idempotence, capacité
/// sous verrou, droits) restent côté serveur ; le client ne fait qu'appeler le
/// contrat. Les erreurs non-2xx sont converties en [ApiFailure] portant l'
/// ErrorCode stable du serveur, sans réinterprétation.
final class KombeApiClient {
  KombeApiClient({
    required Uri baseUrl,
    http.Client? client,
    SessionHeaders? sessionHeaders,
    Duration timeout = const Duration(seconds: 15),
  })  : _baseUrl = baseUrl,
        _client = client ?? http.Client(),
        _sessionHeaders = sessionHeaders ?? _noSession,
        _timeout = timeout;

  final Uri _baseUrl;
  final http.Client _client;
  final SessionHeaders _sessionHeaders;
  final Duration _timeout;

  static Future<Map<String, String>> _noSession() async => const {};

  Uri _uri(String path) =>
      _baseUrl.replace(path: '${_baseUrl.path}$path');

  Future<ApiResponse> get(String path, {Map<String, String>? headers}) =>
      _send('GET', path, headers: headers);

  Future<ApiResponse> post(
    String path,
    Map<String, dynamic> body, {
    Map<String, String>? headers,
  }) =>
      _send('POST', path, body: body, headers: headers);

  Future<ApiResponse> _send(
    String method,
    String path, {
    Map<String, dynamic>? body,
    Map<String, String>? headers,
  }) async {
    final Map<String, String> base = {
      'accept': 'application/json',
      if (body != null) 'content-type': 'application/json',
      ...await _sessionHeaders(),
      if (headers != null) ...headers,
    };

    final http.Request request = http.Request(method, _uri(path))
      ..headers.addAll(base);
    if (body != null) request.body = jsonEncode(body);

    http.Response res;
    try {
      res = await _client.send(request).then(http.Response.fromStream).timeout(
            _timeout,
            onTimeout: () =>
                throw ApiFailure(statusCode: 0, code: 'TIMEOUT'),
          );
    } on ApiFailure {
      rethrow;
    } catch (_) {
      // Erreur réseau crue : on la normalise en échec sans données serveur.
      throw ApiFailure(statusCode: 0, code: 'NETWORK_ERROR');
    }

    if (res.statusCode >= 200 && res.statusCode < 300) {
      if (res.bodyBytes.isEmpty) {
        return ApiResponse(statusCode: res.statusCode, body: const {});
      }
      final dynamic decoded = _tryJson(res.body);
      if (decoded is Map<String, dynamic>) {
        return ApiResponse(statusCode: res.statusCode, body: decoded);
      }
      // Certaines routes (ex. découverte de groupes) renvoient un tableau
      // JSON de premier niveau : on l'enveloppe sous 'items' plutôt que de
      // le perdre en RESPONSE_NOT_JSON. Le transport reste non métier.
      if (decoded is List<dynamic>) {
        return ApiResponse(
          statusCode: res.statusCode,
          body: <String, dynamic>{'items': decoded},
        );
      }
      throw ApiFailure(statusCode: res.statusCode, code: 'RESPONSE_NOT_JSON');
    }
    throw _toFailure(res);
  }

  static Object? _tryJson(String src) {
    try {
      return jsonDecode(src);
    } on FormatException {
      return null;
    }
  }

  /// Traduit une réponse d'erreur en [ApiFailure] en conservant l'ErrorCode
  /// stable du serveur (`Error{code, message, traceId}`) si présent ; sinon un
  /// code générique par statut, sans jamais inventer de sémantique métier.
  static ApiFailure _toFailure(http.Response res) {
    final Object? decoded = _tryJson(res.body);
    String code;
    String? message;
    String? traceId;
    if (decoded is Map<String, dynamic>) {
      code = (decoded['code'] as String?) ?? _codePourStatut(res.statusCode);
      message = decoded['message'] as String?;
      traceId = decoded['traceId'] as String?;
    } else {
      code = _codePourStatut(res.statusCode);
    }
    return ApiFailure(
      statusCode: res.statusCode,
      code: code,
      message: message,
      traceId: traceId,
    );
  }

  static String _codePourStatut(int status) => switch (status) {
        401 => 'UNAUTHENTICATED',
        403 => 'FORBIDDEN',
        404 => 'NOT_FOUND',
        409 => 'CONFLICT',
        >= 500 => 'SERVER_ERROR',
        _ => 'HTTP_$status',
      };

  void close() => _client.close();
}
