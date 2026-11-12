import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/active_group_controller.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_spacing.dart';
import '../../core/design/kombe_theme.dart';
import '../../core/formatters/labels.dart';
import '../../core/state/resource.dart';
import '../../core/web/kombe_web.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/kombe_components.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import '../../l10n/app_localizations.dart';
import 'group_photo_sheet.dart';
import 'invite_member_screen.dart';

/// Fiche d'un groupe : l'essentiel en trois lignes, puis UNE entrée par
/// tâche. Les outils du bureau n'apparaissent qu'avec une fonction ; le
/// serveur reste juge de chaque action.
class GroupDetailScreen extends StatefulWidget {
  const GroupDetailScreen({required this.groupId, super.key});
  final String groupId;

  @override
  State<GroupDetailScreen> createState() => _GroupDetailScreenState();
}

class _GroupDetailScreenState extends State<GroupDetailScreen> {
  Resource<GroupDetails> _state = const ResourceLoading<GroupDetails>();

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final Resource<GroupDetails> next = await context.read<GroupRepository>().getGroup(widget.groupId);
    if (mounted) setState(() => _state = next);
  }

  @override
  Widget build(BuildContext context) {
    final GroupSummary? g = _state is ResourceReady<GroupDetails> ? (_state as ResourceReady<GroupDetails>).data.summary : null;
    return Scaffold(
      appBar: AppBar(
        title: Text(g?.name ?? AppLocalizations.of(context).gdGroupe),
        actions: <Widget>[
          if (g != null && g.can(TontineAct.invite))
            IconButton(
              tooltip: AppLocalizations.of(context).gdInviterUnMembre,
              onPressed: () => showInviteSheet(context, widget.groupId),
              icon: const Icon(Icons.person_add_alt_1_outlined),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ResourceView<GroupDetails>(
          resource: _state,
          onRetry: _load,
          builder: (BuildContext context, GroupDetails d) => _Body(details: d),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.details});
  final GroupDetails details;

  @override
  Widget build(BuildContext context) {
    final GroupSummary g = details.summary;
    final String gid = Uri.encodeComponent(g.id);
    final TextTheme t = Theme.of(context).textTheme;
    final ActiveGroupController? active = _maybeActive(context);
    final bool isActive = active?.active?.id == g.id;
    final bool bureau = g.role != GroupRole.member;
    final int? photo = active?.list.where((GroupSummary x) => x.id == g.id).firstOrNull?.photoVersion ?? g.photoVersion;
    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: <Widget>[
        // Identité : photo (ou motif Ndop), nom, fonction ; modifiable selon la fonction.
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
          child: Row(
            children: <Widget>[
              Stack(
                clipBehavior: Clip.none,
                children: <Widget>[
                  GroupAvatar(groupId: g.id, name: g.name, photoVersion: photo, size: 88),
                  if (canEditGroupPhoto(g.role))
                    Positioned(
                      right: -8,
                      bottom: -8,
                      child: Material(
                        color: KombeColors.goldWarm,
                        shape: const CircleBorder(side: BorderSide(color: KombeColors.cream, width: 2)),
                        child: IconButton(
                          tooltip: AppLocalizations.of(context).gdModifierLaPhoto,
                          visualDensity: VisualDensity.compact,
                          onPressed: () => showGroupPhotoSheet(context, g),
                          icon: const Icon(Icons.photo_camera_outlined, size: 18, color: KombeColors.ink),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 18),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(g.name, style: t.headlineSmall),
                    const SizedBox(height: 6),
                    StatusPill(
                      bureau ? KombeLabels.role(g.role) : AppLocalizations.of(context).roleMemberLabel,
                      tone: bureau ? KombeTone.money : KombeTone.brand,
                      icon: bureau ? Icons.star_rounded : Icons.person_outline_rounded,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        // L'essentiel en trois chiffres réels.
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
          child: KombeCard(
            padding: const EdgeInsets.symmetric(vertical: 14),
            child: IntrinsicHeight(
              child: Row(
                children: <Widget>[
                  _Stat(label: AppLocalizations.of(context).gdParPart, child: KombeAmount(g.contributionAmountXaf, size: 19)),
                  const VerticalDivider(width: 1),
                  _Stat(label: AppLocalizations.of(context).members, child: Text('${g.memberCount}', style: KombeType.amount(size: 22))),
                  const VerticalDivider(width: 1),
                  _Stat(
                    label: AppLocalizations.of(context).gdTour,
                    child: Text(g.cycleTotal > 0 && g.cycleIndex > 0 ? '${g.cycleIndex}/${g.cycleTotal}' : '—', style: KombeType.amount(size: 22)),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (details.description.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 14, 22, 0),
            child: Text(details.description, style: t.bodyMedium),
          ),
        if (active != null && !isActive)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: OutlinedButton.icon(
              onPressed: () {
                unawaited(active.select(g.id));
                context.go('/app');
              },
              icon: const Icon(Icons.home_outlined),
              label: Text(AppLocalizations.of(context).gdAfficherCeGroupeLaccueil),
            ),
          ),
        if (details.pendingCount > 0 && g.can(TontineAct.admit))
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: _Banner(
              icon: Icons.how_to_reg_outlined,
              text: details.pendingCount == 1
                  ? AppLocalizations.of(context).gdDemandeDadhesionExaminer
                  : AppLocalizations.of(context).gdDemandesDadhesionExaminer(details.pendingCount),
              onTap: () => context.push('/app/groups/$gid/members'),
            ),
          ),
        KombeSection(AppLocalizations.of(context).theGroup),
        KombeGroupedList(
          children: <Widget>[
            KombeMenuRow(icon: Icons.groups_2_outlined, title: AppLocalizations.of(context).members, value: '${g.memberCount}', onTap: () => context.push('/app/groups/$gid/members')),
            KombeMenuRow(icon: Icons.donut_large_rounded, tone: KombeTone.success, title: AppLocalizations.of(context).gdCycleEtOrdreDesTours, onTap: () => context.push('/app/groups/$gid/cycle')),
            if (details.cycleStarted)
              KombeMenuRow(icon: Icons.badge_outlined, tone: KombeTone.success, title: AppLocalizations.of(context).gdLesNomsDuCycle, onTap: () => context.push('/app/groups/$gid/names')),
            KombeMenuRow(icon: Icons.account_balance_wallet_outlined, tone: KombeTone.money, title: AppLocalizations.of(context).gdCaisses, onTap: () => context.push('/app/groups/$gid/funds')),
            KombeMenuRow(icon: Icons.menu_book_outlined, tone: KombeTone.neutral, title: AppLocalizations.of(context).rules, onTap: () => context.push('/app/groups/$gid/rules')),
            KombeMenuRow(
              icon: Icons.event_outlined,
              tone: KombeTone.info,
              title: AppLocalizations.of(context).gdSeancesEtProcesVerbaux,
              onTap: () => context.push('/app/groups/$gid/meetings'),
            ),
            KombeMenuRow(icon: Icons.how_to_vote_outlined, tone: KombeTone.info, title: AppLocalizations.of(context).gdVotesLibres, onTap: () => context.push('/app/groups/$gid/polls')),
            KombeMenuRow(icon: Icons.receipt_long_outlined, tone: KombeTone.warning, title: AppLocalizations.of(context).myFines, onTap: () => context.push('/app/fines')),
            KombeMenuRow(
              icon: Icons.gavel_outlined,
              tone: KombeTone.warning,
              title: AppLocalizations.of(context).gdAmendesContestationsEtSecours,
              external: true,
              onTap: () => openInKombeWeb(context, fragment: '/groupe/$gid/discipline', title: AppLocalizations.of(context).gdAmendesEtSecours),
            ),
          ],
        ),
        if (bureau) ...<Widget>[
          KombeSection(AppLocalizations.of(context).dashBureau),
          KombeGroupedList(
            children: <Widget>[
              KombeMenuRow(icon: Icons.work_outline_rounded, tone: KombeTone.money, title: AppLocalizations.of(context).gdOutilsDuBureau, onTap: () => context.push('/app/groups/$gid/bureau')),
              KombeMenuRow(icon: Icons.gavel_rounded, tone: KombeTone.warning, title: AppLocalizations.of(context).gdAmendesDuGroupe, onTap: () => context.push('/app/groups/$gid/fines')),
              KombeMenuRow(icon: Icons.tune_rounded, tone: KombeTone.neutral, title: AppLocalizations.of(context).gdParametresDuGroupe, onTap: () => context.push('/app/groups/$gid/settings')),
            ],
          ),
        ],
      ],
    );
  }

  static ActiveGroupController? _maybeActive(BuildContext context) {
    try {
      return context.watch<ActiveGroupController>();
    } on ProviderNotFoundException {
      return null;
    }
  }
}

/// Chiffre clé : valeur au-dessus, libellé discret dessous.
class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.child});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Column(
            children: <Widget>[
              FittedBox(fit: BoxFit.scaleDown, child: child),
              const SizedBox(height: 4),
              Text(label, style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
      );
}

class _Banner extends StatelessWidget {
  const _Banner({required this.icon, required this.text, required this.onTap});
  final IconData icon;
  final String text;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
        color: KombeColors.mint,
        borderRadius: BorderRadius.circular(KombeSpacing.tileRadius),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(KombeSpacing.tileRadius),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: <Widget>[
                Icon(icon, color: KombeColors.forest),
                const SizedBox(width: 12),
                Expanded(child: Text(text, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: KombeColors.forest))),
                const Icon(Icons.chevron_right_rounded, color: KombeColors.forest),
              ],
            ),
          ),
        ),
      );
}
