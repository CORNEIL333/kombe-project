import 'package:flutter/material.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/kombe_sign_out.dart';
import '../../l10n/app_localizations.dart';

/// Sécurité : ce que KÓMBE fait réellement. Pas d'interrupteur sans effet
/// (le verrou biométrique n'existe pas encore : il n'est pas proposé).
class SecurityScreen extends StatelessWidget {
  const SecurityScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).security)),
        body: ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: <Widget>[
            ListTile(
              leading: Icon(Icons.password_rounded, color: KombeColors.forest),
              title: Text(AppLocalizations.of(context).seConnexionParCodeUsageUnique),
              subtitle: Text(AppLocalizations.of(context).sePasDeMotDePasse),
            ),
            ListTile(
              leading: Icon(Icons.phonelink_lock_outlined, color: KombeColors.forest),
              title: Text(AppLocalizations.of(context).seSessionGardeeSurCeTelephone),
              subtitle: Text(AppLocalizations.of(context).seGardeeDansLeTrousseauProtege),
            ),
            ListTile(
              leading: Icon(Icons.verified_user_outlined, color: KombeColors.forest),
              title: Text(AppLocalizations.of(context).seControlesCroises),
              subtitle: Text(AppLocalizations.of(context).sePersonneNeConfirmeNiNe),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(20, 24, 20, 0),
              child: KombeBoutonDeconnexion(),
            ),
          ],
        ),
      );
}
