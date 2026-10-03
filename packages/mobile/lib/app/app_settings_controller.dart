import 'package:flutter/material.dart';

import '../domain/repositories/preferences_repository.dart';

final class AppSettingsController extends ChangeNotifier {
  AppSettingsController(this._preferences);

  final PreferencesRepository _preferences;
  Locale _locale = const Locale('fr');
  bool _initialized = false;

  Locale get locale => _locale;
  bool get initialized => _initialized;

  Future<void> initialize() async {
    final String code = await _preferences.loadLocaleCode();
    _locale = Locale(code == 'en' ? 'en' : 'fr');
    _initialized = true;
    notifyListeners();
  }

  Future<void> setLocale(Locale locale) async {
    final Locale normalized = Locale(locale.languageCode == 'en' ? 'en' : 'fr');
    if (_locale == normalized) return;
    _locale = normalized;
    notifyListeners();
    await _preferences.saveLocaleCode(normalized.languageCode);
  }
}
