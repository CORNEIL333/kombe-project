abstract final class AuthValidators {
  static bool isCameroonLocalPhone(String value) =>
      RegExp(r'^[2368]\d{8}$').hasMatch(value.replaceAll(RegExp(r'\s+'), ''));

  /// Forme minimale (local@domaine), jamais une validation RFC 5322 complète
  /// côté client — le serveur reste seul juge de l'existence du compte
  /// (anti-énumération, ADR-0024).
  static bool isEmail(String value) =>
      RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value.trim());

  static bool isChallengeCode(String value) =>
      RegExp(r'^\d{4,8}$').hasMatch(value);
}
