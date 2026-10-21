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
                    title: Text('Ce que fait KÓMBE'),
                    subtitle: Text(
                      'Le registre de votre tontine ou association : cotisations déclarées et confirmées, tours, caisses, '
                      'séances, statuts et votes, visibles par les membres.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('Ce que KÓMBE ne fait pas'),
                    subtitle: Text(
                      'KÓMBE ne garde pas l’argent et ne fait aucun paiement : l’argent passe entre les membres et le trésorier, '
                      'comme d’habitude.',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Center(
              child: TextButton(
                onPressed: () => showLicensePage(context: context, applicationName: 'KÓMBE'),
                child: const Text('Licences des polices et bibliothèques'),
              ),
            ),
          ],
        ),
      );
}
