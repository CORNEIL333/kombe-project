import 'package:flutter/material.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/widgets/kombe_sign_out.dart';

/// Sécurité : ce que KÓMBE fait réellement. Pas d'interrupteur sans effet
/// (le verrou biométrique n'existe pas encore : il n'est pas proposé).
class SecurityScreen extends StatelessWidget {
  const SecurityScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Sécurité')),
        body: ListView(
          padding: const EdgeInsets.symmetric(vertical: 8),
          children: const <Widget>[
            ListTile(
              leading: Icon(Icons.password_rounded, color: KombeColors.forest),
              title: Text('Connexion par code à usage unique'),
              subtitle: Text('Pas de mot de passe : un code reçu par e-mail, valable une seule fois.'),
            ),
            ListTile(
              leading: Icon(Icons.phonelink_lock_outlined, color: KombeColors.forest),
              title: Text('Session gardée sur ce téléphone'),
              subtitle: Text('Protégée par le coffre sécurisé du système. Une session expirée demande un nouveau code.'),
            ),
            ListTile(
              leading: Icon(Icons.verified_user_outlined, color: KombeColors.forest),
              title: Text('Contrôles croisés'),
              subtitle: Text('Personne ne confirme ni ne contrôle ses propres paiements : KÓMBE l’interdit.'),
            ),
            Padding(
              padding: EdgeInsets.fromLTRB(20, 24, 20, 0),
              child: KombeBoutonDeconnexion(),
            ),
          ],
        ),
      );
}
