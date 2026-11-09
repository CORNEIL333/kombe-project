import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../widgets/kombe_sheet.dart';

const String _api = String.fromEnvironment('KOMBE_API_BASE_URL');

/// Adresse de KÓMBE Web (PWA) : même hôte que l'API, sans `/v1`.
Uri? kombeWebUri(String fragment) {
  if (_api.isEmpty) return null;
  final Uri api = Uri.parse(_api);
  return api.replace(path: '${api.path.replaceFirst(RegExp(r'/v1/?$'), '')}/', fragment: fragment);
}

/// Transition explicite vers KÓMBE Web pour une fonction absente de l'app :
/// la personne sait qu'elle change d'outil (et qu'une connexion par code peut
/// y être demandée), rien n'est ouvert sans son geste.
Future<void> openInKombeWeb(BuildContext context, {required String fragment, required String title}) async {
  final Uri? uri = kombeWebUri(fragment);
  await showKombeSheet<void>(
    context,
    title: title,
    builder: (BuildContext sheet) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        const Text(
          'Cette partie se fait dans KÓMBE Web, ouvert dans votre navigateur. '
          'Si vous n’y êtes pas encore connecté, un code vous sera demandé.',
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: uri == null
              ? null
              : () async {
                  Navigator.of(sheet).pop();
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                },
          icon: const Icon(Icons.open_in_new_rounded),
          label: const Text('Ouvrir KÓMBE Web'),
        ),
      ],
    ),
  );
}
