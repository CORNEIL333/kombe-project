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
                      'Aucune donnée métier n’est embarquée. Seuls les brouillons explicitement créés par l’utilisateur peuvent être conservés localement.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.lock_outline),
                    title: Text('Secrets'),
                    subtitle: Text(
                      'Les secrets de session sont destinés au stockage sécurisé natif, jamais à SQLite ni aux logs.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.verified_user_outlined),
                    title: Text('Autorité serveur'),
                    subtitle: Text(
                      'Validation, vote, rôle, règle et décaissement ne peuvent pas devenir officiels hors serveur.',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
