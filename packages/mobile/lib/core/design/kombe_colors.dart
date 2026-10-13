import 'package:flutter/material.dart';

/// Palette KÓMBE, direction « L'Orbite » v2 (oct. 2026). Mêmes ancres que la
/// PWA et les tableaux de bord (docs/design-system/tokens.md). Les noms sont
/// conservés ; seules les valeurs suivent la nouvelle gamme. `gold` (or 500)
/// est réservé aux formes ; pour du texte or sur fond clair, utiliser
/// `goldDark` (or 700, 5,3:1 sur sable).
abstract final class KombeColors {
  static const Color night = Color(0xFF061F1B);
  static const Color forest = Color(0xFF103C32);
  static const Color forestDark = Color(0xFF082C26);
  static const Color emerald = Color(0xFF176B52);
  static const Color leaf = Color(0xFF2A8A68);
  static const Color gold = Color(0xFFC7922E);
  static const Color goldLight = Color(0xFFE2B868);
  static const Color goldDark = Color(0xFF8A5F14);
  static const Color clay = Color(0xFFB5603D);
  static const Color cream = Color(0xFFFBF8F1);
  static const Color sand = Color(0xFFF3ECDD);
  static const Color mint = Color(0xFFDCEFE6);
  static const Color ink = Color(0xFF13211C);
  static const Color slate = Color(0xFF56645E);
  static const Color line = Color(0xFFE7DCC6);
  static const Color danger = Color(0xFFB42318);
  static const Color warning = Color(0xFF8A5F14);
  static const Color success = Color(0xFF176B52);
}
