import '../../domain/entities/auth.dart';

abstract final class AuthValidators {
  static bool isCameroonLocalPhone(String value) =>
      RegExp(r'^[2368]\d{8}$').hasMatch(value.replaceAll(RegExp(r'\s+'), ''));

  /// Forme minimale (local@domaine), jamais une validation RFC 5322 complète
  /// côté client — le serveur reste seul juge de l'existence du compte
  /// (anti-énumération, ADR-0024).
  static bool isEmail(String value) =>
      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value.trim());

  /// Numéro camerounais : 6 77 12 34 56, +237…, 00237….
  static bool isPhone(String value) {
    String d = value.trim().replaceAll(RegExp(r'[\s.\-()]'), '');
    if (d.startsWith('+237')) d = d.substring(4);
    if (d.startsWith('00237')) d = d.substring(5);
    if (d.length == 12 && d.startsWith('237')) d = d.substring(3);
    return isCameroonLocalPhone(d);
  }

  /// Identifiant de connexion (ADR-0025) : numéro camerounais ou e-mail.
  static bool isLogin(String value) {
    final String v = value.trim();
    if (v.contains('@')) return isEmail(v);
    return isPhone(v);
  }

  /// Identifiant valable pour la voie choisie.
  static bool isLoginFor(LoginChannel channel, String value) =>
      channel == LoginChannel.email ? isEmail(value) : isPhone(value);

  /// Code serveur : exactement 6 chiffres.
  static bool isChallengeCode(String value) => RegExp(r'^\d{6}$').hasMatch(value.trim());
}
