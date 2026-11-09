import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';

/// Ce qui existe vraiment, sans faux interrupteurs : les notifications
/// internes (onglet Activité) sont toujours actives ; les alertes sur le
/// téléphone (push), le SMS et WhatsApp ne sont pas encore proposés.
class NotificationPreferencesScreen extends StatelessWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: <Widget>[
          ListTile(
            leading: const Icon(Icons.notifications_active_outlined, color: KombeColors.forest),
            title: const Text('Dans l’application'),
            subtitle: const Text(
              'Toujours actives : échéances de cotisation, déclarations à confirmer, statuts à accepter, votes, séances, '
              'demandes d’adhésion, remises, amendes. Retrouvez-les dans l’onglet Activité ; touchez-en une pour '
              'ouvrir l’écran concerné.',
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.go('/app/notifications'),
          ),
          const ListTile(
            leading: Icon(Icons.schedule_outlined, color: KombeColors.forest),
            title: Text('Rappels avant échéance'),
            subtitle: Text(
              'KÓMBE vous relance de plus en plus près de l’échéance (cotisation, séance, statuts, vote). '
              'Ces rappels ne se désactivent pas : ils protègent votre place dans le groupe.',
            ),
          ),
          const Divider(indent: 20, endIndent: 20),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
            child: Text('Pas encore disponibles', style: t.titleSmall?.copyWith(color: KombeColors.slate)),
          ),
          const ListTile(
            leading: Icon(Icons.phone_android_rounded),
            title: Text('Alertes sur le téléphone'),
            subtitle: Text('Pour l’instant, ouvrez l’application pour voir les nouveautés.'),
          ),
          const ListTile(
            leading: Icon(Icons.sms_outlined),
            title: Text('SMS et WhatsApp'),
            subtitle: Text('Le bureau partage les invitations et les comptes rendus lui-même.'),
          ),
        ],
      ),
    );
  }
}
