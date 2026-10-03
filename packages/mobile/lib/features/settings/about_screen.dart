import 'package:flutter/material.dart';

import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/section_card.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('À propos')),
        body: ListView(
          padding: const EdgeInsets.all(24),
          children: <Widget>[
            const Center(child: KombeLogo(size: 56)),
            const SizedBox(height: 28),
            const SectionCard(
              child: Column(
                children: <Widget>[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Client mobile'),
                    trailing: Text('Flutter'),
                  ),
                  Divider(),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Données embarquées'),
                    trailing: Text('Aucune'),
                  ),
                  Divider(),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Autorité métier'),
                    trailing: Text('Serveur KÓMBE'),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
