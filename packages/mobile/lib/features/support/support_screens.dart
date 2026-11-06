import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../core/widgets/section_card.dart';

class HelpCenterScreen extends StatelessWidget {
  const HelpCenterScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Centre d’aide')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            Text(
              'Aide KÓMBE',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 12),
            const SectionCard(
              child: Column(
                children: <Widget>[
                  ListTile(
                    leading: Icon(Icons.info_outline),
                    title: Text('Comprendre une cotisation'),
                    subtitle: Text(
                      'Un paiement compte une fois confirmé par la trésorerie. Un brouillon n’est pas envoyé.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.gavel_outlined),
                    title: Text('Contester une opération'),
                    subtitle: Text(
                      'Un désaccord sur une amende se conteste dans KÓMBE Web, onglet Discipline du groupe.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.offline_bolt_outlined),
                    title: Text('Utiliser KÓMBE hors connexion'),
                    subtitle: Text(
                      'Vos brouillons restent sur ce téléphone. Envoyez-les quand le réseau revient : rien ne part deux fois.',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}

class ContactSupportScreen extends StatelessWidget {
  const ContactSupportScreen({super.key});

  static const String _api = String.fromEnvironment('KOMBE_API_BASE_URL');

  /// Page de contact publique du site (la même que la PWA).
  static Uri? get _contact {
    if (_api.isEmpty) return null;
    final Uri api = Uri.parse(_api);
    return api.replace(path: '${api.path.replaceFirst(RegExp(r'/v1/?$'), '')}/site/aide/', fragment: 'contact');
  }

  @override
  Widget build(BuildContext context) {
    final Uri? contact = _contact;
    return Scaffold(
      appBar: AppBar(title: const Text('Nous contacter')),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: <Widget>[
          const ListTile(
            leading: Icon(Icons.groups_outlined),
            title: Text('Une question sur votre groupe ?'),
            subtitle: Text('Le bureau de votre tontine est le premier à pouvoir vous répondre.'),
          ),
          ListTile(
            leading: const Icon(Icons.support_agent_outlined),
            title: const Text('Contacter l’équipe KÓMBE'),
            subtitle: const Text('Formulaire et adresses sur la page d’aide du site.'),
            trailing: const Icon(Icons.open_in_new_rounded),
            enabled: contact != null,
            onTap: contact == null ? null : () => launchUrl(contact, mode: LaunchMode.externalApplication),
          ),
        ],
      ),
    );
  }
}
