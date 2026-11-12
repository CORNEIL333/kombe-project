import 'package:flutter/material.dart';

import '../../core/widgets/section_card.dart';
import '../../l10n/app_localizations.dart';

class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).securityPrivacy)),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            Text(
              AppLocalizations.of(context).pvPrincipesAppliquesParLeClient,
              style: Theme.of(context).textTheme.headlineMedium,
            ),
            const SizedBox(height: 16),
            SectionCard(
              child: Column(
                children: <Widget>[
                  ListTile(
                    leading: Icon(Icons.storage_outlined),
                    title: Text(AppLocalizations.of(context).pvMinimisationLocale),
                    subtitle: Text(
                      AppLocalizations.of(context).pvSeulsVosBrouillonsDeDeclaration,
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.lock_outline),
                    title: Text(AppLocalizations.of(context).pvSecrets),
                    subtitle: Text(
                      AppLocalizations.of(context).pvLesSecretsDeSessionRestent,
                    ),
                  ),
                  Divider(),
                  ListTile(
                    leading: Icon(Icons.verified_user_outlined),
                    title: Text(AppLocalizations.of(context).pvDecisionsEnregistreesEnLigne),
                    subtitle: Text(
                      AppLocalizations.of(context).pvConfirmationsVotesFonctionsEtRegles,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
