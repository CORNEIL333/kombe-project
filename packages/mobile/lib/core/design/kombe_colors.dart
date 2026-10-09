import 'package:flutter/material.dart';

import 'kombe_tokens.g.dart';

/// Couleurs nommées du produit, adossées aux jetons canoniques
/// (`packages/brand/tokens/kombe.tokens.json` → `kombe_tokens.g.dart`).
/// Les noms historiques sont conservés ; seules les valeurs suivent la charte.
abstract final class KombeColors {
  static const Color forest = KombeTokens.brand; // #103C32 Forêt
  static const Color forestDark = KombeTokens.brandDeep; // #082C26
  static const Color emerald = KombeTokens.brandAction; // #176B52 Vert actif
  static const Color leaf = KombeTokens.brandLiving; // #2A8A68
  static const Color gold = KombeTokens.accent; // #C7922E — accent, jamais texte sur clair
  static const Color goldDark = KombeTokens.gold700; // or lisible sur sable (icônes)
  static const Color cream = KombeTokens.surfaceCanvas; // #FBF8F1
  static const Color sand = KombeTokens.surfaceSunken; // #F3ECDD
  static const Color mint = KombeTokens.forest50;
  static const Color ink = KombeTokens.contentPrimary; // #13211C
  static const Color slate = KombeTokens.contentSecondary; // ≥ 4.5:1 sur sable
  static const Color line = KombeTokens.line;
  static const Color lineStrong = KombeTokens.lineStrong;
  static const Color danger = KombeTokens.danger;
  static const Color warning = KombeTokens.warning;
  static const Color success = KombeTokens.success;
}
