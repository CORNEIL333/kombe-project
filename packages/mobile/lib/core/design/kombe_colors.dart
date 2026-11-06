import 'package:flutter/material.dart';

/// Palette KÓMBE (docs/refonte/DESIGN.md), trois teintes par écran : le vert
/// de marque (`brand`), le safran de l'action (`goldWarm`) et des neutres chauds.
/// `forest` (vert très sombre) sert au texte et aux icônes, jamais en aplat.
/// `danger` : uniquement retard et erreur.
abstract final class KombeColors {
  static const Color brand = Color(0xFF12805C);
  static const Color night = Color(0xFF061F1B);
  static const Color forest = Color(0xFF103C32);
  static const Color forestDark = Color(0xFF082C26);
  static const Color emerald = Color(0xFF12805C);
  static const Color leaf = Color(0xFF2A8A68);
  static const Color gold = Color(0xFFF2B01E);
  static const Color jade = Color(0xFF12805C);
  static const Color goldWarm = Color(0xFFF2B01E);
  static const Color goldPale = Color(0xFFFFEDBF);
  /// Accent des grands titres (maquette « Connectez-vous »).
  static const Color olive = Color(0xFFA8AD3B);
  static const Color goldLight = Color(0xFFFFD262);
  static const Color goldDark = Color(0xFF8A5F14);
  static const Color cream = Color(0xFFFBF8F1);
  static const Color sand = Color(0xFFF3ECDD);
  static const Color mint = Color(0xFFDCEFE6);
  static const Color ink = Color(0xFF13211C);
  static const Color slate = Color(0xFF56645E);
  static const Color line = Color(0xFFE7DCC6);
  static const Color lineStrong = Color(0xFFD9D0BC);
  static const Color danger = Color(0xFFB42318);
  static const Color warning = Color(0xFF8A5F14);
  static const Color success = Color(0xFF12805C);

  /// Teintes douces d'identité (avatars, liserés de groupe) : toujours avec
  /// du texte encre, jamais comme fond de carte.
  static const List<Color> tints = <Color>[
    Color(0xFFD5EBDF),
    Color(0xFFF6E7BF),
    Color(0xFFEFE6D2),
    Color(0xFFE6EBCB),
    Color(0xFFF0DED2),
    Color(0xFFDEE8E6),
    Color(0xFFE9E4D8),
    Color(0xFFE3EFE6),
  ];
  static Color tintOf(String key) => tints[key.codeUnits.fold<int>(7, (int a, int c) => (a * 31 + c) & 0x7fffffff) % tints.length];
}
