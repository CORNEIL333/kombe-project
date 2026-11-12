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
      appBar: AppBar(title: const Text('Langue')),
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
                  subtitle: Text('Some messages from the server may still appear in French.'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          // Honnêteté : les messages d'erreur rédigés par le serveur restent en français.
          Text(AppLocalizations.of(context).langServerNote),
        ],
      ),
    );
  }
}
