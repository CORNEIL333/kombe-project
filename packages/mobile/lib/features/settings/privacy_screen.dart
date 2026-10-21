import 'package:flutter/material.dart';

import '../../core/widgets/section_card.dart';

class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Sécurité et confidentialité')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            Text(
              'Principes appliqués par le client mobile',
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            const SectionCard(
              child: Column(
                children: <Widget>[
                  ListTile(
                    leading: Icon(Icons.storage_outlined),
                    title: Text('Minimisation locale'),
                    subtitle: Text(
                      'Seuls vos brouillons de déclaration sont gardés sur ce téléphone ; le reste est lu depuis KÓMBE à chaque ouverture.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.lock_outline),
                    title: Text('Secrets'),
                    subtitle: Text(
                      'Les secrets de session restent dans le coffre de l’appareil (Keychain, Keystore), jamais dans SQLite ni dans les journaux.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.verified_user_outlined),
                    title: Text('Ce qui fait foi'),
                    subtitle: Text(
                      'Confirmations, votes, fonctions et statuts ne comptent qu’une fois enregistrés par KÓMBE, jamais depuis un téléphone hors ligne.',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
