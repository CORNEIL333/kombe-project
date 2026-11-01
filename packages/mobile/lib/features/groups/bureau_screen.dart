import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../app/active_group_controller.dart';
import '../../app/router/main_shell.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/web/kombe_web.dart';
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
          ? const Center(
              child: Padding(
                padding: EdgeInsets.all(32),
                child: Text('Vous n’avez pas de fonction au bureau de ce groupe.', textAlign: TextAlign.center),
              ),
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
      body: g == null ? const Center(child: CircularProgressIndicator()) : BureauTools(group: g),
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
        _Section('Argent'),
        if (money)
          _Row(
            icon: Icons.fact_check_outlined,
            title: group.role == GroupRole.controller ? 'Paiements à contrôler' : 'Déclarations à confirmer',
            onTap: () => context.push('/app/validations'),
          ),
        _Row(icon: Icons.account_balance_wallet_outlined, title: 'Caisses et soldes', onTap: () => context.push('/app/groups/$gid/funds')),
        _Section('Membres'),
        _Row(icon: Icons.person_add_alt_1_outlined, title: 'Inviter un membre', onTap: () => showInviteSheet(context, id)),
        _Row(icon: Icons.people_outline_rounded, title: 'Membres et fonctions', onTap: () => context.push('/app/groups/$gid/members')),
        _Section('Tours et séances'),
        _Row(icon: Icons.autorenew_rounded, title: 'Cycle et ordre des tours', onTap: () => context.push('/app/groups/$gid/cycle')),
        _Row(icon: Icons.emoji_events_outlined, title: 'Bénéficiaires', onTap: () => context.push('/app/groups/$gid/beneficiaries')),
        _Row(
          icon: Icons.event_outlined,
          title: 'Séances et présences',
          web: true,
          onTap: () => openInKombeWeb(context, fragment: '/groupe/$gid/seances', title: 'Séances'),
        ),
        _Row(
          icon: Icons.gavel_outlined,
          title: 'Amendes et secours',
          web: true,
          onTap: () => openInKombeWeb(context, fragment: '/groupe/$gid/discipline', title: 'Amendes et secours'),
        ),
        _Section('Règles'),
        _Row(icon: Icons.description_outlined, title: 'Statuts du groupe', onTap: () => context.push('/app/groups/$gid/rules')),
        _Row(icon: Icons.tune_rounded, title: 'Paramètres du groupe', onTap: () => context.push('/app/groups/$gid/settings')),
        if (web != null) ...<Widget>[
          const SizedBox(height: 12),
          _Row(
            icon: Icons.dashboard_outlined,
            title: 'Tableau de bord complet du bureau',
            web: true,
            onTap: () => launchUrl(web, mode: LaunchMode.externalApplication),
          ),
        ],
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 4),
        child: Semantics(
          header: true,
          child: Text(text, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: KombeColors.slate)),
        ),
      );
}

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.title, required this.onTap, this.web = false});
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final bool web;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(icon, color: KombeColors.forest),
        title: Text(title),
        trailing: Icon(web ? Icons.open_in_new_rounded : Icons.chevron_right_rounded, semanticLabel: web ? 'ouvre KÓMBE Web' : null),
        onTap: onTap,
      );
}
