import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/list_row.dart';
import '../../core/widgets/section_card.dart';
import '../../core/widgets/server_action_guard.dart';

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
                    title: 'Membres',
                    onTap: () => context.push('/app/groups/$groupId/members'),
                  ),
                  const Divider(),
                  KombeListRow(
                    icon: Icons.rule_outlined,
                    title: 'Règles',
                    onTap: () => context.push('/app/groups/$groupId/rules'),
                  ),
                  const Divider(),
                  KombeListRow(
                    icon: Icons.manage_accounts_outlined,
                    title: 'Rôles et responsabilités',
                    subtitle: 'Modification uniquement après validation serveur',
                    onTap: () => showServerAuthorityRequired(context),
                  ),
                ],
              ),
            ),
          ],
        ),
      );
}
