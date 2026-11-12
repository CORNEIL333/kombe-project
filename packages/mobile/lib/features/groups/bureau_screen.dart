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
import '../../l10n/app_localizations.dart';
import 'invite_member_screen.dart';

/// Onglet « Bureau » : les outils du groupe actif selon la fonction tenue.
class ActiveBureauScreen extends StatelessWidget {
  const ActiveBureauScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final GroupSummary? g = context.watch<ActiveGroupController>().active;
    return Scaffold(
      appBar: KombeTopBar(title: Text(AppLocalizations.of(context).dashBureau)),
      body: g == null || g.role == GroupRole.member
          ? EmptyState(
              icon: Icons.work_outline_rounded,
              title: AppLocalizations.of(context).buPasDeFonctionAuBureau,
              body: AppLocalizations.of(context).buLesOutilsDuBureauApparaissent,
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
      appBar: AppBar(title: Text(g == null ? AppLocalizations.of(context).dashBureau : AppLocalizations.of(context).buBureau2(g.name))),
      // Groupe absent de la liste : squelette pendant le chargement, puis état explicite.
      body: g == null
          ? (context.watch<ActiveGroupController>().list.isEmpty
              ? const KombeListSkeleton()
              : EmptyState(icon: Icons.lock_outline_rounded, title: AppLocalizations.of(context).buBureauIndisponible, body: AppLocalizations.of(context).buCeGroupeNeFigurePas))
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
        KombeSection(AppLocalizations.of(context).buArgent),
        KombeGroupedList(
          children: <Widget>[
            if (money)
              KombeMenuRow(
                icon: Icons.fact_check_outlined,
                tone: KombeTone.money,
                title: group.role == GroupRole.controller ? AppLocalizations.of(context).buPaiementsControler : AppLocalizations.of(context).buPaiementsConfirmer,
                onTap: () => context.push('/app/validations'),
              ),
            KombeMenuRow(icon: Icons.account_balance_wallet_outlined, tone: KombeTone.money, title: AppLocalizations.of(context).gdCaisses, onTap: () => context.push('/app/groups/$gid/funds')),
          ],
        ),
        KombeSection(AppLocalizations.of(context).members),
        KombeGroupedList(
          children: <Widget>[
            if (group.can(TontineAct.invite))
              KombeMenuRow(icon: Icons.person_add_alt_1_outlined, title: AppLocalizations.of(context).gdInviterUnMembre, onTap: () => showInviteSheet(context, id)),
            KombeMenuRow(icon: Icons.groups_2_outlined, title: AppLocalizations.of(context).buMembresEtFonctions, onTap: () => context.push('/app/groups/$gid/members')),
          ],
        ),
        KombeSection(AppLocalizations.of(context).buToursEtSeances),
        KombeGroupedList(
          children: <Widget>[
            KombeMenuRow(icon: Icons.donut_large_rounded, tone: KombeTone.success, title: AppLocalizations.of(context).gdCycleEtOrdreDesTours, onTap: () => context.push('/app/groups/$gid/cycle')),
            KombeMenuRow(icon: Icons.emoji_events_outlined, tone: KombeTone.money, title: AppLocalizations.of(context).buQuiRecoit, onTap: () => context.push('/app/groups/$gid/beneficiaries')),
            KombeMenuRow(
              icon: Icons.event_outlined,
              tone: KombeTone.info,
              title: AppLocalizations.of(context).buSeancesEtPresences,
              external: true,
              onTap: () => openInKombeWeb(context, fragment: '/groupe/$gid/seances', title: AppLocalizations.of(context).meSeances),
            ),
            KombeMenuRow(
              icon: Icons.gavel_outlined,
              tone: KombeTone.warning,
              title: AppLocalizations.of(context).gdAmendesEtSecours,
              external: true,
              onTap: () => openInKombeWeb(context, fragment: '/groupe/$gid/discipline', title: AppLocalizations.of(context).gdAmendesEtSecours),
            ),
          ],
        ),
        KombeSection(AppLocalizations.of(context).rules),
        KombeGroupedList(
          children: <Widget>[
            KombeMenuRow(icon: Icons.menu_book_outlined, tone: KombeTone.neutral, title: AppLocalizations.of(context).rules, onTap: () => context.push('/app/groups/$gid/rules')),
            KombeMenuRow(icon: Icons.tune_rounded, tone: KombeTone.neutral, title: AppLocalizations.of(context).gdParametresDuGroupe, onTap: () => context.push('/app/groups/$gid/settings')),
          ],
        ),
        if (web != null) ...<Widget>[
          const SizedBox(height: 20),
          KombeGroupedList(
            children: <Widget>[
              KombeMenuRow(
                icon: Icons.dashboard_outlined,
                title: AppLocalizations.of(context).buTableauDeBordCompletDu,
                subtitle: AppLocalizations.of(context).buSurOrdinateurDansLeNavigateur,
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
