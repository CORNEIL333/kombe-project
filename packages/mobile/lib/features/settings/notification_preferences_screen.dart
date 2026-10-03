import 'package:flutter/material.dart';

import '../../core/widgets/section_card.dart';

class NotificationPreferencesScreen extends StatelessWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Préférences de notifications')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            const SectionCard(
              child: Column(
                children: <Widget>[
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.notifications_active_outlined),
                    title: Text('Notifications internes KÓMBE'),
                    subtitle: Text(
                      'Les préférences seront chargées et enregistrées par le serveur.',
                    ),
                  ),
                  Divider(),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.sms_outlined),
                    title: Text('SMS'),
                    subtitle: Text('Canal futur soumis au consentement et au gate G1.'),
                  ),
                  Divider(),
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: Icon(Icons.chat_outlined),
                    title: Text('WhatsApp'),
                    subtitle: Text('Canal futur soumis au consentement et au gate G1.'),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
