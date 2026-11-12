import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/app_settings_controller.dart';
import '../../l10n/app_localizations.dart';

class LanguageScreen extends StatelessWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final AppSettingsController settings = context.watch<AppSettingsController>();
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).language)),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: <Widget>[
          RadioGroup<String>(
            groupValue: settings.locale.languageCode,
            onChanged: (String? value) {
              if (value != null) settings.setLocale(Locale(value));
            },
            child: const Column(
              children: <Widget>[
                RadioListTile<String>(
                  value: 'fr',
                  title: Text('Français'),
                ),
                RadioListTile<String>(
                  value: 'en',
                  title: Text('English'),
                  subtitle: Text('Menus, screens and server messages.'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Honnêteté : les textes saisis par des personnes ne sont pas traduits.
          Text(AppLocalizations.of(context).langServerNote),
        ],
      ),
    );
  }
}
