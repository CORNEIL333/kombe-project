import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/core/update/kombe_update.dart';

void main() {
  test('lit le manifeste publié par le pipeline', () {
    final KombeRelease? r = KombeRelease.fromJson(<String, dynamic>{
      'version': '0.7.0',
      'build': 70,
      'minBuild': 65,
      'publishedAt': '2026-10-26T06:00:00Z',
      'notes': <String>['Mise à jour directe'],
      'apks': <String, dynamic>{
        'arm64-v8a': <String, dynamic>{'url': 'https://example.org/kombe-arm64.apk', 'sha256': 'ABC', 'size': 2048},
      },
    });
    expect(r, isNotNull);
    expect(r!.build, 70);
    expect(r.minBuild, 65);
    expect(r.notes, <String>['Mise à jour directe']);
    expect(r.apks['arm64-v8a']!.sha256, 'abc');
    expect(r.apks['arm64-v8a']!.size, 2048);
  });

  test('refuse un manifeste incomplet', () {
    expect(KombeRelease.fromJson(<String, dynamic>{'version': '0.7.0'}), isNull);
    expect(KombeRelease.fromJson(<String, dynamic>{'build': 70, 'apks': <String, dynamic>{}}), isNull);
  });

  test('mise à jour obligatoire sous le build minimal', () {
    final KombeRelease r = KombeRelease.fromJson(<String, dynamic>{
      'version': '0.7.0',
      'build': 70,
      'minBuild': 65,
      'apks': <String, dynamic>{'arm64-v8a': <String, dynamic>{'url': 'https://e.org/a.apk', 'sha256': 'x'}},
    })!;
    final KombeApk apk = r.apks['arm64-v8a']!;
    expect(UpdateAvailable(const InstalledVersion(name: '0.6.0', build: 60), r, apk).mandatory, isTrue);
    expect(UpdateAvailable(const InstalledVersion(name: '0.6.5', build: 66), r, apk).mandatory, isFalse);
  });
}
