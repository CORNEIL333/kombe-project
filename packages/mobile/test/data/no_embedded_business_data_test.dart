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
}
