import 'dart:io';

import 'package:flutter/services.dart';

/// Polices réelles (Manrope, Fraunces, icônes) : rendu fidèle, pas d'Ahem.
Future<void> loadKombeFonts() async {
  Future<void> family(String name, List<String> files) async {
    final FontLoader l = FontLoader(name);
    for (final String f in files) {
      l.addFont(Future<ByteData>.value(ByteData.sublistView(Uint8List.fromList(File('assets/fonts/$f').readAsBytesSync()))));
    }
    await l.load();
  }

  await family('Manrope', <String>['Manrope-400.ttf', 'Manrope-500.ttf', 'Manrope-600.ttf', 'Manrope-700.ttf', 'Manrope-800.ttf']);
  await family('Fraunces', <String>['Fraunces-600.ttf', 'Fraunces-700.ttf']);
  final File icons = File('${Platform.environment['FLUTTER_ROOT'] ?? ''}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (icons.existsSync()) {
    final FontLoader l = FontLoader('MaterialIcons')..addFont(Future<ByteData>.value(ByteData.sublistView(Uint8List.fromList(icons.readAsBytesSync()))));
    await l.load();
  }
}
