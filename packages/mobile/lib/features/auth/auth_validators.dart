abstract final class AuthValidators {
  static bool isCameroonLocalPhone(String value) =>
      RegExp(r'^[2368]\d{8}$').hasMatch(value.replaceAll(RegExp(r'\s+'), ''));

  static bool isPin(String value) => RegExp(r'^\d{4}$').hasMatch(value);

  static bool isChallengeCode(String value) =>
      RegExp(r'^\d{4,8}$').hasMatch(value);
}
