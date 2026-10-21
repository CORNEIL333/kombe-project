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
                      'Vous payez le trésorier comme d’habitude (espèces, Mobile Money…), puis vous déclarez le versement. '
                      'Il compte quand le trésorier l’a confirmé. KÓMBE ne garde jamais l’argent.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.gavel_outlined),
                    title: Text('Contester une amende'),
                    subtitle: Text(
                      'Dans « Plus › Mes amendes », contestez une amende avec un motif : la présidence l’annule ou la maintient.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.offline_bolt_outlined),
                    title: Text('Sans réseau'),
                    subtitle: Text(
                      'Vous pouvez préparer une déclaration ; elle est envoyée quand la connexion revient.',
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
                title: Text('Besoin d’aide ?'),
                subtitle: Text(
                  'Pour une question sur votre groupe (cotisation, tour, amende), adressez-vous d’abord à son bureau : '
                  'président, secrétaire général ou trésorier. Pour un problème avec l’application, parlez-en à votre bureau, '
                  'qui le signalera à l’équipe KÓMBE.',
                ),
              ),
            ),
          ],
        ),
      );
}
