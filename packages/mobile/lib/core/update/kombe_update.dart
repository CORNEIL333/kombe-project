import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

/// Mise à jour directe de l'application installée.
///
/// Le pipeline GitHub (`.github/workflows/mobile-release.yml`) publie à chaque
/// nouvelle version une release `mobile-v<version>` contenant les APK et un
/// manifeste `kombe-update.json`. L'application lit le manifeste de la
/// dernière release, compare son numéro de build au sien, télécharge l'APK de
/// son architecture, vérifie l'empreinte SHA-256 puis confie l'installation à
/// Android — qui demande toujours confirmation et refuse un APK signé par une
/// autre clé. Rien n'est installé en silence.
const String kombeUpdateManifestUrl = String.fromEnvironment(
  'KOMBE_UPDATE_MANIFEST_URL',
  defaultValue: 'https://github.com/CORNEIL333/kombe-project/releases/download/mobile-latest/kombe-update.json',
);

final class KombeApk {
  const KombeApk({required this.url, required this.sha256, required this.size});
  final Uri url;
  final String sha256;
  final int size;
}

final class KombeRelease {
  const KombeRelease({
    required this.version,
    required this.build,
    required this.notes,
    required this.apks,
    required this.minBuild,
    this.publishedAt,
  });

  final String version;
  final int build;
  final List<String> notes;
  final Map<String, KombeApk> apks;

  /// En dessous de ce build, la mise à jour est obligatoire (contrat d'API).
  final int minBuild;
  final DateTime? publishedAt;

  static KombeRelease? fromJson(Map<String, dynamic> j) {
    final Object? apks = j['apks'];
    if (j['version'] is! String || j['build'] is! num || apks is! Map<String, dynamic>) return null;
    return KombeRelease(
      version: j['version'] as String,
      build: (j['build'] as num).toInt(),
      notes: ((j['notes'] as List<dynamic>?) ?? const <dynamic>[]).map((dynamic n) => '$n').toList(),
      minBuild: (j['minBuild'] as num?)?.toInt() ?? 0,
      publishedAt: DateTime.tryParse('${j['publishedAt'] ?? ''}'),
      apks: <String, KombeApk>{
        for (final MapEntry<String, dynamic> e in apks.entries)
          if (e.value is Map<String, dynamic> && Uri.tryParse('${(e.value as Map<String, dynamic>)['url']}') != null)
            e.key: KombeApk(
              url: Uri.parse('${(e.value as Map<String, dynamic>)['url']}'),
              sha256: '${(e.value as Map<String, dynamic>)['sha256']}'.toLowerCase(),
              size: ((e.value as Map<String, dynamic>)['size'] as num?)?.toInt() ?? 0,
            ),
      },
    );
  }
}

final class InstalledVersion {
  const InstalledVersion({required this.name, required this.build});
  final String name;
  final int build;
}

sealed class UpdateCheck {
  const UpdateCheck();
}

final class UpToDate extends UpdateCheck {
  const UpToDate(this.installed);
  final InstalledVersion installed;
}

final class UpdateAvailable extends UpdateCheck {
  const UpdateAvailable(this.installed, this.release, this.apk);
  final InstalledVersion installed;
  final KombeRelease release;
  final KombeApk apk;
  bool get mandatory => installed.build < release.minBuild;
}

final class UpdateUnavailable extends UpdateCheck {
  const UpdateUnavailable(this.reason);
  final String reason;
}

class KombeUpdater {
  KombeUpdater({http.Client? client, MethodChannel? channel})
      : _client = client ?? http.Client(),
        _channel = channel ?? const MethodChannel('kombe/mise_a_jour');

  final http.Client _client;
  final MethodChannel _channel;

  bool get supported => !kIsWeb && Platform.isAndroid;

  /// Architecture de l'appareil, lue dans la signature de la VM Dart
  /// (« … on "android_arm64" ») : pas de dépendance supplémentaire.
  static String abi() {
    final String v = Platform.version;
    if (v.contains('android_arm64')) return 'arm64-v8a';
    if (v.contains('android_arm')) return 'armeabi-v7a';
    if (v.contains('android_x64')) return 'x86_64';
    return 'arm64-v8a';
  }

  Future<InstalledVersion> installed() async {
    final Map<Object?, Object?>? r = await _channel.invokeMapMethod<Object?, Object?>('version');
    return InstalledVersion(name: '${r?['name'] ?? ''}', build: (r?['code'] as num?)?.toInt() ?? 0);
  }

  Future<UpdateCheck> check() async {
    if (!supported) return const UpdateUnavailable('Mise à jour directe disponible sur Android uniquement.');
    try {
      final InstalledVersion me = await installed();
      final http.Response res = await _client.get(Uri.parse(kombeUpdateManifestUrl)).timeout(const Duration(seconds: 15));
      if (res.statusCode != 200) return const UpdateUnavailable('Aucune version publiée pour le moment.');
      final KombeRelease? rel = KombeRelease.fromJson(jsonDecode(utf8.decode(res.bodyBytes)) as Map<String, dynamic>);
      if (rel == null) return const UpdateUnavailable('Fichier de version illisible.');
      if (rel.build <= me.build) return UpToDate(me);
      final KombeApk? apk = rel.apks[abi()] ?? rel.apks['universal'];
      if (apk == null) return const UpdateUnavailable('Pas de version pour ce téléphone.');
      return UpdateAvailable(me, rel, apk);
    } on Object {
      return const UpdateUnavailable('Vérification impossible : pas de réseau ?');
    }
  }

  /// Télécharge l'APK dans le cache, vérifie son empreinte SHA-256, puis
  /// ouvre l'installeur Android. [progress] reçoit une valeur entre 0 et 1.
  Future<void> download(KombeApk apk, {void Function(double)? progress}) async {
    final Directory cache = await getApplicationCacheDirectory();
    final Directory dir = Directory('${cache.path}/mises_a_jour');
    if (dir.existsSync()) dir.deleteSync(recursive: true);
    dir.createSync(recursive: true);
    final File file = File('${dir.path}/kombe.apk');
    final http.StreamedResponse res = await _client.send(http.Request('GET', apk.url));
    if (res.statusCode != 200) throw HttpException('Téléchargement refusé (${res.statusCode})');
    final int total = res.contentLength ?? apk.size;
    final IOSink sink = file.openWrite();
    final List<Digest> out = <Digest>[];
    final ByteConversionSink hasher = sha256.startChunkedConversion(ChunkedConversionSink<Digest>.withCallback(out.addAll));
    int received = 0;
    await for (final List<int> chunk in res.stream) {
      sink.add(chunk);
      hasher.add(chunk);
      received += chunk.length;
      if (total > 0) progress?.call((received / total).clamp(0, 1).toDouble());
    }
    await sink.close();
    hasher.close();
    if (out.isEmpty || out.first.toString() != apk.sha256) {
      file.deleteSync();
      throw const FormatException('Empreinte du fichier invalide : téléchargement corrompu ou modifié.');
    }
    if (!(await _channel.invokeMethod<bool>('peutInstaller') ?? false)) {
      await _channel.invokeMethod<void>('autoriserInstallation');
      throw const InstallPermissionNeeded();
    }
    await _channel.invokeMethod<void>('installer', <String, String>{'chemin': file.path});
  }

  /// Relance l'installation d'un APK déjà téléchargé et vérifié.
  Future<void> installDownloaded() async {
    final Directory cache = await getApplicationCacheDirectory();
    await _channel.invokeMethod<void>('installer', <String, String>{'chemin': '${cache.path}/mises_a_jour/kombe.apk'});
  }
}

final class InstallPermissionNeeded implements Exception {
  const InstallPermissionNeeded();
  @override
  String toString() =>
      'Autorisez KÓMBE à installer ses mises à jour (réglage Android ouvert), puis revenez et touchez « Installer ».';
}
