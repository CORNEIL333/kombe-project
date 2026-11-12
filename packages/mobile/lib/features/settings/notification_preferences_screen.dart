import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';
import '../../l10n/app_localizations.dart';

/// Ce qui existe vraiment, sans faux interrupteurs : les notifications
/// internes (onglet Activité) sont toujours actives ; les alertes sur le
/// téléphone (push), le SMS et WhatsApp ne sont pas encore proposés.
class NotificationPreferencesScreen extends StatelessWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(AppLocalizations.of(context).notifications)),
      body: ListView(
        padding: const EdgeInsets.symmetric(vertical: 8),
        children: <Widget>[
          ListTile(
            leading: const Icon(Icons.notifications_active_outlined, color: KombeColors.forest),
            title: Text(AppLocalizations.of(context).npDansLapplication),
            subtitle: Text(
              AppLocalizations.of(context).npToujoursActivesEcheancesDeCotisation,
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => context.go('/app/notifications'),
          ),
          ListTile(
            leading: Icon(Icons.schedule_outlined, color: KombeColors.forest),
            title: Text(AppLocalizations.of(context).npRappelsAvantEcheance),
            subtitle: Text(
              AppLocalizations.of(context).npKombeVousRelanceDePlus,
            ),
          ),
          const Divider(indent: 20, endIndent: 20),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 4),
            child: Text(AppLocalizations.of(context).npPasEncoreDisponibles, style: t.titleSmall?.copyWith(color: KombeColors.slate)),
          ),
          ListTile(
            leading: Icon(Icons.phone_android_rounded),
            title: Text(AppLocalizations.of(context).npAlertesSurLeTelephone),
            subtitle: Text(AppLocalizations.of(context).npPourLinstantOuvrezLapplicationPour),
          ),
          ListTile(
            leading: Icon(Icons.sms_outlined),
            title: Text(AppLocalizations.of(context).npSmsEtWhatsapp),
            subtitle: Text(AppLocalizations.of(context).npLeBureauPartageLesInvitations),
          ),
        ],
      ),
    );
  }
}
