import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/list_row.dart';
import '../../core/widgets/section_card.dart';

class GroupSettingsScreen extends StatelessWidget {
  const GroupSettingsScreen({required this.groupId, super.key});
  final String groupId;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Paramètres du groupe')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: <Widget>[
            SectionCard(
              child: Column(
                children: <Widget>[
                  KombeListRow(
                    icon: Icons.people_outline,
                    title: 'Membres et demandes d’adhésion',
                    onTap: () => context.push('/app/groups/$groupId/members'),
                  ),
                  const Divider(),
                  KombeListRow(
                    icon: Icons.rule_outlined,
                    title: 'Statuts',
                    subtitle: 'Lire, accepter ; publier et relancer pour le bureau',
                    onTap: () => context.push('/app/groups/$groupId/rules'),
                  ),
                  const Divider(),
                  KombeListRow(
                    icon: Icons.manage_accounts_outlined,
                    title: 'Rôles et responsabilités',
                    subtitle: 'Touchez un membre pour lui proposer une fonction ; la personne doit l’accepter',
                    onTap: () => context.push('/app/groups/$groupId/members'),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
