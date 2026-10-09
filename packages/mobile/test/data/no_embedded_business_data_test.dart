import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('source tree contains no seeded business fixture files', () {
    final Directory lib = Directory('lib');
    final List<String> forbiddenFileFragments = <String>[
      'fixture',
      'seed_data',
      'demo_data',
      'mock_business',
      'fake_business',
    ];

    final List<String> offenders = <String>[];
    for (final FileSystemEntity entity in lib.listSync(recursive: true)) {
      if (entity is! File) continue;
      final String normalized = entity.path.toLowerCase();
      if (forbiddenFileFragments.any(normalized.contains)) {
        offenders.add(entity.path);
      }
    }
    expect(offenders, isEmpty);
  });

  // Le MODE ESSAI (données fictives) vit dans lib/trial/ et n'est atteint que
  // par l'entrée dédiée lib/main_trial.dart. L'app de production ne doit
  // JAMAIS l'importer, même indirectement.
  test('production code never imports the trial sandbox', () {
    final Directory lib = Directory('lib');
    final List<String> offenders = <String>[];
    for (final FileSystemEntity entity in lib.listSync(recursive: true)) {
      if (entity is! File || !entity.path.endsWith('.dart')) continue;
      final String path = entity.path.replaceAll(r'\', '/');
      if (path.contains('lib/trial/') || path.endsWith('lib/main_trial.dart')) continue;
      final String source = entity.readAsStringSync();
      if (RegExp(r"import\s+'[^']*trial/").hasMatch(source) || source.contains('main_trial.dart')) {
        offenders.add(path);
      }
    }
    expect(offenders, isEmpty);
  });
}

