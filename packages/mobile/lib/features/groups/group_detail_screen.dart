import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../app/active_group_controller.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/formatters/xaf.dart';
import '../../core/state/resource.dart';
import '../../core/web/kombe_web.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/screen_states.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
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
        title: Text(g?.name ?? 'Groupe'),
        actions: <Widget>[
          if (g != null && g.can(TontineAct.invite))
            IconButton(
              tooltip: 'Inviter un membre',
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
    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: <Widget>[
        // Photo du groupe (ou couverture tissée) ; modifiable selon la fonction.
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          child: Row(
            children: <Widget>[
              Stack(
                clipBehavior: Clip.none,
                children: <Widget>[
                  GroupAvatar(groupId: g.id, name: g.name, photoVersion: active?.list.where((GroupSummary x) => x.id == g.id).firstOrNull?.photoVersion ?? g.photoVersion, size: 88),
                  if (canEditGroupPhoto(g.role))
                    Positioned(
                      right: -8,
                      bottom: -8,
                      child: Material(
                        color: KombeColors.goldWarm,
                        shape: const CircleBorder(side: BorderSide(color: KombeColors.cream, width: 2)),
                        child: IconButton(
                          tooltip: 'Modifier la photo',
                          visualDensity: VisualDensity.compact,
                          onPressed: () => showGroupPhotoSheet(context, g),
                          icon: const Icon(Icons.edit_outlined, size: 18, color: KombeColors.ink),
                        ),
                      ),
                    ),
                ],
              ),
              const SizedBox(width: 18),
              Expanded(child: Text(g.name, style: t.headlineSmall?.copyWith(fontWeight: FontWeight.w800, color: KombeColors.forest))),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('${Xaf.format(g.contributionAmountXaf)} par part', style: t.titleLarge?.copyWith(fontWeight: FontWeight.w800)),
              const SizedBox(height: 4),
              Text(
                '${g.memberCount} membres · ${_roleLabel(g.role)}',
                style: t.bodyMedium?.copyWith(color: KombeColors.slate),
              ),
              if (details.description.isNotEmpty) ...<Widget>[
                const SizedBox(height: 8),
                Text(details.description, style: t.bodySmall?.copyWith(color: KombeColors.slate)),
              ],
            ],
          ),
        ),
        if (active != null && !isActive)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
            child: OutlinedButton.icon(
              onPressed: () {
                unawaited(active.select(g.id));
                context.go('/app');
              },
              icon: const Icon(Icons.home_outlined),
              label: const Text('Afficher ce groupe à l’accueil'),
            ),
          ),
        if (details.pendingCount > 0 && g.can(TontineAct.admit))
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: _Banner(
              icon: Icons.how_to_reg_outlined,
              text: details.pendingCount == 1
                  ? '1 demande d’adhésion à examiner'
                  : '${details.pendingCount} demandes d’adhésion à examiner',
              onTap: () => context.push('/app/groups/$gid/members'),
            ),
          ),
        const _Section('Le groupe'),
        _Row(icon: Icons.people_outline_rounded, title: 'Membres', subtitle: '${g.memberCount}', onTap: () => context.push('/app/groups/$gid/members')),
        _Row(icon: Icons.autorenew_rounded, title: 'Cycle et ordre des tours', onTap: () => context.push('/app/groups/$gid/cycle')),
        _Row(icon: Icons.account_balance_wallet_outlined, title: 'Caisses', onTap: () => context.push('/app/groups/$gid/funds')),
        _Row(icon: Icons.description_outlined, title: 'Statuts', onTap: () => context.push('/app/groups/$gid/rules')),
        _Row(
          icon: Icons.event_outlined,
          title: 'Séances et procès-verbaux',
          web: true,
          onTap: () => openInKombeWeb(context, fragment: '/groupe/$gid/seances', title: 'Séances'),
        ),
        _Row(icon: Icons.receipt_long_outlined, title: 'Mes amendes', onTap: () => context.push('/app/fines')),
        _Row(
          icon: Icons.gavel_outlined,
          title: 'Amendes, contestations et secours',
          web: true,
          onTap: () => openInKombeWeb(context, fragment: '/groupe/$gid/discipline', title: 'Amendes et secours'),
        ),
        if (bureau) ...<Widget>[
          const _Section('Bureau'),
          _Row(icon: Icons.work_outline_rounded, title: 'Outils du bureau', onTap: () => context.push('/app/groups/$gid/bureau')),
          _Row(icon: Icons.tune_rounded, title: 'Paramètres du groupe', onTap: () => context.push('/app/groups/$gid/settings')),
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

String _roleLabel(GroupRole r) => switch (r) {
      GroupRole.member => 'vous êtes membre',
      GroupRole.treasurer => 'vous tenez la trésorerie',
      GroupRole.controller => 'vous êtes commissaire aux comptes',
      GroupRole.secretary => 'vous tenez le secrétariat',
      GroupRole.administrator => 'vous présidez',
    };

class _Section extends StatelessWidget {
  const _Section(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 22, 20, 4),
        child: Semantics(
          header: true,
          child: Text(text, style: Theme.of(context).textTheme.titleSmall?.copyWith(color: KombeColors.slate)),
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
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
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

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.title, required this.onTap, this.subtitle, this.web = false});
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;
  final bool web;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(icon, color: KombeColors.forest),
        title: Text(title),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            if (subtitle != null) Text(subtitle!, style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: KombeColors.slate)),
            const SizedBox(width: 4),
            Icon(web ? Icons.open_in_new_rounded : Icons.chevron_right_rounded, semanticLabel: web ? 'ouvre KÓMBE Web' : null),
          ],
        ),
        onTap: onTap,
      );
}
