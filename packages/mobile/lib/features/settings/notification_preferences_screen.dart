import 'package:flutter/material.dart';

import '../../core/widgets/section_card.dart';

class NotificationPreferencesScreen extends StatelessWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Notifications')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: const <Widget>[
            SectionCard(
              child: Column(
                children: <Widget>[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.notifications_active_outlined),
                    title: Text('Dans l’application'),
                    subtitle: Text(
                      'Échéances de cotisation, séances, statuts à accepter, votes, demandes d’adhésion : '
                      'tout arrive dans l’onglet Notifications. Touchez une notification pour ouvrir l’écran concerné.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.schedule_outlined),
                    title: Text('Rappels avant échéance'),
                    subtitle: Text(
                      'KÓMBE vous relance de plus en plus près de l’échéance (cotisation, séance, statuts, vote). '
                      'Ces rappels ne se désactivent pas : ils protègent votre place dans le groupe.',
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
