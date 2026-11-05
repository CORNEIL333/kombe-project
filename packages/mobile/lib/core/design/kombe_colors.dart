import 'package:flutter/material.dart';

/// Palette « Ndop » (docs/refonte/DESIGN.md). Les noms historiques sont gardés
/// pour ne pas réécrire chaque écran : `forest` est l'indigo dominant,
/// `cream` le coton de fond, `goldWarm` le maïs (l'argent et l'action
/// principale), `jade` le seul vert (« confirmé »). Sur fond clair, l'or en
/// texte s'écrit `goldDark`.
abstract final class KombeColors {
  static const Color night = Color(0xFF0E1140);
  static const Color forest = Color(0xFF161A5C);
  static const Color forestDark = Color(0xFF0E1140);
  static const Color emerald = Color(0xFF2F35A8);
  static const Color leaf = Color(0xFF2F35A8);
  static const Color gold = Color(0xFFF5B700);
  static const Color jade = Color(0xFF0B7A53);
  static const Color goldWarm = Color(0xFFF5B700);
  static const Color goldPale = Color(0xFFFFF0C2);
  /// Accent des grands titres (maquette « Connectez-vous »).
  static const Color olive = Color(0xFFA8AD3B);
  static const Color goldLight = Color(0xFFFFD34D);
  static const Color goldDark = Color(0xFF7A5600);
  static const Color clay = Color(0xFFC92A12);
  static const Color cream = Color(0xFFF5F5FB);
  static const Color sand = Color(0xFFEDEDF7);
  static const Color mint = Color(0xFFE4E5FA);
  static const Color ink = Color(0xFF12142E);
  static const Color slate = Color(0xFF4E5270);
  static const Color line = Color(0xFFDADBF0);
  static const Color lineStrong = Color(0xFFC3C5E6);
  static const Color danger = Color(0xFFC92A12);
  static const Color warning = Color(0xFF7A5600);
  static const Color success = Color(0xFF0B7A53);
}
