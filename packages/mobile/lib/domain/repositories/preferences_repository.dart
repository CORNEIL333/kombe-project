abstract interface class PreferencesRepository {
  Future<String> loadLocaleCode();
  Future<void> saveLocaleCode(String localeCode);
  Future<bool> loadBiometricPreference();
  Future<void> saveBiometricPreference(bool enabled);
}
