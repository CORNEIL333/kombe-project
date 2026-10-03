import 'package:flutter/material.dart';

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
                      'Une déclaration locale ou un brouillon ne vaut jamais validation.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.gavel_outlined),
                    title: Text('Contester une opération'),
                    subtitle: Text(
                      'L’ouverture et le suivi d’un litige passent par le serveur KÓMBE.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.offline_bolt_outlined),
                    title: Text('Utiliser KÓMBE hors connexion'),
                    subtitle: Text(
                      'Seuls les brouillons locaux et certaines lectures autorisées peuvent rester disponibles.',
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

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Nous contacter')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            const SectionCard(
              child: ListTile(
                leading: Icon(Icons.support_agent_outlined),
                title: Text('Canal de support'),
                subtitle: Text(
                  'Le canal officiel sera injecté par configuration serveur. '
                  'Aucun numéro, email ou lien n’est codé en dur.',
                ),
              ),
            ),
          ],
        ),
      );
}
