import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/list_row.dart';
import '../../core/widgets/section_card.dart';
import '../../l10n/app_localizations.dart';

class GroupSettingsScreen extends StatelessWidget {
  const GroupSettingsScreen({required this.groupId, super.key});
  final String groupId;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(AppLocalizations.of(context).gdParametresDuGroupe)),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            SectionCard(
              child: Column(
                children: <Widget>[
                  KombeListRow(
                    icon: Icons.people_outline,
                    title: AppLocalizations.of(context).gsMembresEtDemandesDadhesion,
                    onTap: () => context.push('/app/groups/$groupId/members'),
                  ),
                  const Divider(),
                  KombeListRow(
                    icon: Icons.rule_outlined,
                    title: AppLocalizations.of(context).catStatuts,
                    subtitle: AppLocalizations.of(context).gsLireAccepterPublierEtRelancer,
                    onTap: () => context.push('/app/groups/$groupId/rules'),
                  ),
                  const Divider(),
                  KombeListRow(
                    icon: Icons.manage_accounts_outlined,
                    title: AppLocalizations.of(context).gsRolesEtResponsabilites,
                    subtitle: AppLocalizations.of(context).gsTouchezUnMembrePourLui,
                    onTap: () => context.push('/app/groups/$groupId/members'),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
