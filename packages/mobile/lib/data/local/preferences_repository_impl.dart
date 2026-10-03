import 'package:shared_preferences/shared_preferences.dart';

import '../../domain/repositories/preferences_repository.dart';

final class PreferencesRepositoryImpl implements PreferencesRepository {
  PreferencesRepositoryImpl(this._prefs);

  final SharedPreferencesAsync _prefs;

  static const String _localeKey = 'ui.locale';
  static const String _biometricKey = 'security.biometric_preference';

  @override
  Future<String> loadLocaleCode() async =>
      await _prefs.getString(_localeKey) ?? 'fr';

  @override
  Future<void> saveLocaleCode(String localeCode) =>
      _prefs.setString(_localeKey, localeCode);

  @override
  Future<bool> loadBiometricPreference() async =>
      await _prefs.getBool(_biometricKey) ?? false;

  @override
  Future<void> saveBiometricPreference(bool enabled) =>
      _prefs.setBool(_biometricKey, enabled);
}
