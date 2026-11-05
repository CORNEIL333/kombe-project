import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/active_group_controller.dart';
import '../../app/router/main_shell.dart';
import '../../core/formatters/labels.dart';
import '../../core/web/kombe_web.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import 'invite_member_screen.dart';

/// Onglet « Bureau » : les outils du groupe actif selon la fonction tenue.
class ActiveBureauScreen extends StatelessWidget {
  const ActiveBureauScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final GroupSummary? g = context.watch<ActiveGroupController>().active;
    return Scaffold(
      appBar: const KombeTopBar(title: Text('Bureau')),
      body: g == null || g.role == GroupRole.member
          ? const EmptyState(
              icon: Icons.work_outline_rounded,
              title: 'Pas de fonction au bureau',
              body: 'Les outils du bureau apparaissent ici quand vous tenez une fonction dans ce groupe.',
            )
          : BureauTools(group: g),
    );
  }
}

/// Route directe `/app/groups/:id/bureau` (lien, notification).
class BureauScreen extends StatelessWidget {
  const BureauScreen({required this.groupId, super.key});
  final String groupId;

  @override
  Widget build(BuildContext context) {
    final GroupSummary? g =
        context.watch<ActiveGroupController>().list.where((GroupSummary x) => x.id == groupId).firstOrNull;
    return Scaffold(
      appBar: AppBar(title: Text(g == null ? 'Bureau' : 'Bureau · ${g.name}')),
      // Groupe absent de la liste : squelette pendant le chargement, puis état explicite.
      body: g == null
          ? (context.watch<ActiveGroupController>().list.isEmpty
              ? const KombeListSkeleton()
              : const EmptyState(icon: Icons.lock_outline_rounded, title: 'Bureau indisponible', body: 'Ce groupe ne figure pas parmi les vôtres.'))
          : BureauTools(group: g),
    );
  }
}

/// Outils par tâche. Le serveur reste juge de chaque action (fonction,
/// indépendance : on ne confirme jamais sa propre déclaration).
class BureauTools extends StatelessWidget {
  const BureauTools({required this.group, super.key});
  final GroupSummary group;

  static const String _api = String.fromEnvironment('KOMBE_API_BASE_URL');

  Uri? get _tableauWeb {
    if (_api.isEmpty) return null;
    final Uri api = Uri.parse(_api);
    return api.replace(path: '${api.path.replaceFirst(RegExp(r'/v1/?$'), '')}/bureau/');
  }

  @override
  Widget build(BuildContext context) {
    final String id = group.id;
    final String gid = Uri.encodeComponent(id);
    final bool money = group.role == GroupRole.treasurer || group.role == GroupRole.controller || group.role == GroupRole.administrator;
    final Uri? web = _tableauWeb;
    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: <Widget>[
        // Pour quel groupe, avec quelle fonction : jamais d'ambiguïté.
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
          child: Row(
            children: <Widget>[
              GroupAvatar(groupId: group.id, name: group.name, photoVersion: group.photoVersion, size: 52),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(group.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 4),
                    StatusPill(KombeLabels.role(group.role), tone: KombeTone.money, icon: Icons.star_rounded),
                  ],
                ),
              ),
            ],
          ),
        ),
        const KombeSection('Argent'),
        KombeGroupedList(
          children: <Widget>[
            if (money)
              KombeMenuRow(
                icon: Icons.fact_check_outlined,
                tone: KombeTone.money,
                title: group.role == GroupRole.controller ? 'Paiements à contrôler' : 'Paiements à confirmer',
                onTap: () => context.push('/app/validations'),
              ),
            KombeMenuRow(icon: Icons.account_balance_wallet_outlined, tone: KombeTone.money, title: 'Caisses et soldes', onTap: () => context.push('/app/groups/$gid/funds')),
          ],
        ),
        const KombeSection('Membres'),
        KombeGroupedList(
          children: <Widget>[
            KombeMenuRow(icon: Icons.person_add_alt_1_outlined, title: 'Inviter un membre', onTap: () => showInviteSheet(context, id)),
            KombeMenuRow(icon: Icons.groups_2_outlined, title: 'Membres et fonctions', onTap: () => context.push('/app/groups/$gid/members')),
          ],
        ),
        const KombeSection('Tours et séances'),
        KombeGroupedList(
          children: <Widget>[
            KombeMenuRow(icon: Icons.donut_large_rounded, tone: KombeTone.success, title: 'Cycle et ordre des tours', onTap: () => context.push('/app/groups/$gid/cycle')),
            KombeMenuRow(icon: Icons.emoji_events_outlined, tone: KombeTone.money, title: 'Qui reçoit', onTap: () => context.push('/app/groups/$gid/beneficiaries')),
            KombeMenuRow(
              icon: Icons.event_outlined,
              tone: KombeTone.info,
              title: 'Séances et présences',
              external: true,
              onTap: () => openInKombeWeb(context, fragment: '/groupe/$gid/seances', title: 'Séances'),
            ),
            KombeMenuRow(
              icon: Icons.gavel_outlined,
              tone: KombeTone.warning,
              title: 'Amendes et secours',
              external: true,
              onTap: () => openInKombeWeb(context, fragment: '/groupe/$gid/discipline', title: 'Amendes et secours'),
            ),
          ],
        ),
        const KombeSection('Règles'),
        KombeGroupedList(
          children: <Widget>[
            KombeMenuRow(icon: Icons.menu_book_outlined, tone: KombeTone.neutral, title: 'Règles', onTap: () => context.push('/app/groups/$gid/rules')),
            KombeMenuRow(icon: Icons.tune_rounded, tone: KombeTone.neutral, title: 'Paramètres du groupe', onTap: () => context.push('/app/groups/$gid/settings')),
          ],
        ),
        if (web != null) ...<Widget>[
          const SizedBox(height: 20),
          KombeGroupedList(
            children: <Widget>[
              KombeMenuRow(
                icon: Icons.dashboard_outlined,
                title: 'Tableau de bord complet du bureau',
                subtitle: 'Sur ordinateur, dans le navigateur',
                external: true,
                onTap: () => launchUrl(web, mode: LaunchMode.externalApplication),
              ),
            ],
          ),
        ],
      ],
    );
  }
}
