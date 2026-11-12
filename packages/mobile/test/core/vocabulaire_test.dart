// KÓMBE ne détient aucun argent : les textes affichés de l'application
// n'emploient jamais le vocabulaire bancaire qui le laisserait croire
// (épargne, solde, retrait, débité, sécurisé, garanti, chiffré).
// On examine les chaînes littérales du code (pas les commentaires).
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

final RegExp _interdits = RegExp(
  r'(?<![\p{L}])(épargnes?|soldes?|retraits?|débitée?s?|sécurisée?s?|garantie?s?|chiffrée?s?)(?![\p{L}])',
  caseSensitive: false,
  unicode: true,
);
final RegExp _chaine = RegExp(r"'((?:[^'\\]|\\.)*)'");

void main() {
  test('la garde reconnaît les mots visés, accents compris', () {
    expect(_interdits.hasMatch('Sécurisé'), isTrue);
    expect(_interdits.hasMatch('votre solde'), isTrue);
    expect(_interdits.hasMatch('soldat consolidé'), isFalse);
  });

  test('aucun mot bancaire trompeur dans les textes affichés', () {
    final List<String> fautes = <String>[];
    for (final FileSystemEntity f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart') || f.path.endsWith('.g.dart')) continue;
      final List<String> lignes = f.readAsLinesSync();
      for (int i = 0; i < lignes.length; i++) {
        final String l = lignes[i].trimLeft();
        if (l.startsWith('//') || l.startsWith('///') || l.startsWith('*')) continue;
        for (final RegExpMatch m in _chaine.allMatches(lignes[i])) {
          if (_interdits.hasMatch(m.group(1)!)) fautes.add('${f.path}:${i + 1}: ${m.group(1)}');
        }
      }
    }
    expect(fautes, isEmpty);
  });
}
