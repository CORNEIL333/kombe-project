import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_ndop.dart';
import '../../core/design/kombe_icons.g.dart';
import '../../core/state/resource.dart';
import '../../core/update/kombe_update_sheet.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/kombe_icon.dart';
import '../../core/widgets/kombe_logo.dart';
import '../../core/widgets/kombe_sheet.dart';
import '../../domain/entities/group.dart';
import '../../domain/entities/notification.dart';
import '../../domain/repositories/notification_repository.dart';
import '../../features/notifications/notification_actions.dart';
import '../../features/notifications/notifications_screen.dart';
import '../active_group_controller.dart';

/// Branches du shell (ordre fixe, voir `AppRouter`) : quatre destinations.
abstract final class ShellBranch {
  static const int home = 0;
  static const int contributions = 1;
  static const int groups = 2;
  static const int activity = 3;
}

/// Ouvre le menu latéral et la cloche depuis n'importe quel onglet (chaque
/// onglet a son propre Scaffold ; menu et compteur appartiennent au shell).
class KombeShellScope extends InheritedWidget {
  const KombeShellScope({super.key, required this.openMenu, required this.unread, required this.refreshUnread, required super.child});
  final VoidCallback openMenu;
  final int unread;
  final VoidCallback refreshUnread;

  static KombeShellScope? of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<KombeShellScope>();

  @override
  bool updateShouldNotify(KombeShellScope old) => old.unread != unread;
}

/// Barre supérieure (planche) : menu, pilule du groupe actif au centre,
/// cloche avec pastille or. `dark` : fondue dans le bandeau forêt de l'accueil.
class KombeTopBar extends StatelessWidget implements PreferredSizeWidget {
  const KombeTopBar({super.key, this.title, this.dark = false, this.actions = const <Widget>[]});
  final Widget? title;
  final bool dark;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(64);

  @override
  Widget build(BuildContext context) {
    final KombeShellScope? shell = KombeShellScope.of(context);
    final Color fg = dark ? KombeColors.cream : KombeColors.ink;
    final int unread = shell?.unread ?? 0;
    return AppBar(
      toolbarHeight: 64,
      backgroundColor: dark ? KombeColors.forest : KombeColors.cream,
      surfaceTintColor: Colors.transparent,
      foregroundColor: fg,
      elevation: 0,
      centerTitle: true,
      automaticallyImplyLeading: false,
      leading: shell == null
          ? null
          : IconButton(tooltip: 'Menu', onPressed: shell.openMenu, icon: KombeIcon(KombeIconData.menu, size: 26, color: fg)),
      title: title ?? ActiveGroupTitle(dark: dark),
      actions: <Widget>[
        ...actions,
        IconButton(
          tooltip: unread > 0 ? 'Non lues, $unread' : 'Non lues',
          onPressed: () => showUnreadSheet(context),
          icon: Badge(
            isLabelVisible: unread > 0,
            backgroundColor: KombeColors.goldWarm,
            textColor: KombeColors.ink,
            label: Text(unread > 99 ? '99+' : '$unread'),
            child: KombeIcon(KombeIconData.cloche, size: 26, color: fg),
          ),
        ),
        const SizedBox(width: 6),
      ],
    );
  }
}

/// Pilule du groupe actif : ouvre la liste des groupes en demi-fenêtre.
class ActiveGroupTitle extends StatelessWidget {
  const ActiveGroupTitle({super.key, this.dark = false});
  final bool dark;

  @override
  Widget build(BuildContext context) {
    final ActiveGroupController groups = context.watch<ActiveGroupController>();
    final GroupSummary? g = groups.active;
    if (g == null) return KombeLogo(size: 28, inverse: dark);
    final bool several = groups.list.length > 1;
    final Color fg = dark ? KombeColors.cream : KombeColors.forest;
    return Semantics(
      button: several,
      label: several ? 'Groupe actif : ${g.name}. Changer de groupe' : 'Groupe : ${g.name}',
      excludeSemantics: true,
      child: Material(
        color: dark ? Colors.white.withValues(alpha: .14) : KombeColors.mint,
        shape: const StadiumBorder(),
        child: InkWell(
          customBorder: const StadiumBorder(),
          onTap: several ? () => showGroupSwitcher(context) : null,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 40, maxWidth: 240),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: <Widget>[
                  Flexible(
                    child: Text(g.name,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: fg, fontWeight: FontWeight.w800, fontSize: 15)),
                  ),
                  if (several) ...<Widget>[const SizedBox(width: 4), Icon(Icons.keyboard_arrow_down_rounded, size: 22, color: fg)],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Changer de groupe sans quitter l'écran.
Future<void> showGroupSwitcher(BuildContext context) => showKombeSheet<void>(
      context,
      title: 'Vos groupes',
      builder: (BuildContext sheet) {
        final ActiveGroupController groups = sheet.watch<ActiveGroupController>();
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            for (final GroupSummary g in groups.list)
              _GroupTile(
                group: g,
                selected: g.id == groups.active?.id,
                onTap: () {
                  unawaited(groups.select(g.id));
                  Navigator.of(sheet).pop();
                },
              ),
          ],
        );
      },
    );

/// La cloche ouvre les NON LUES ; l'onglet Activité garde l'historique.
Future<void> showUnreadSheet(BuildContext context) async {
  final NotificationRepository repo = context.read<NotificationRepository>();
  final KombeShellScope? shell = KombeShellScope.of(context);
  await showKombeSheet<void>(
    context,
    title: 'Non lues',
    builder: (BuildContext sheet) => FutureBuilder<Resource<List<KombeNotification>>>(
      future: repo.listNotifications(),
      builder: (BuildContext c, AsyncSnapshot<Resource<List<KombeNotification>>> snap) {
        final Resource<List<KombeNotification>>? r = snap.data;
        if (r == null) return const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()));
        final List<KombeNotification> unread = switch (r) {
          ResourceReady<List<KombeNotification>>(:final List<KombeNotification> data) => data.where((KombeNotification n) => !n.read).take(8).toList(),
          _ => const <KombeNotification>[],
        };
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            if (unread.isEmpty) const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Text('Tout est lu. Rien de nouveau.')),
            for (final KombeNotification n in unread)
              NotificationTile(
                n: n,
                onTap: () {
                  Navigator.of(sheet).pop();
                  unawaited(openNotification(context, n));
                },
              ),
            const SizedBox(height: 8),
            OutlinedButton(
              onPressed: () {
                Navigator.of(sheet).pop();
                context.go('/app/notifications');
              },
              child: const Text('Toute l’activité'),
            ),
          ],
        );
      },
    ),
  );
  shell?.refreshUnread();
}

class _GroupTile extends StatelessWidget {
  const _GroupTile({required this.group, required this.selected, required this.onTap});
  final GroupSummary group;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final bool treasury = group.role == GroupRole.treasurer;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Material(
        color: selected ? KombeColors.mint : Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            child: Row(
              children: <Widget>[
                GroupAvatar(groupId: group.id, name: group.name, photoVersion: group.photoVersion, size: 44, round: true),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: <Widget>[
                      Text(group.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      const SizedBox(height: 2),
                      Row(
                        children: <Widget>[
                          Flexible(child: Text(roleLabel(group.role), style: const TextStyle(color: KombeColors.slate, fontSize: 13))),
                          if (treasury) ...<Widget>[const SizedBox(width: 8), const RoleBadge(label: 'Trésorier')],
                        ],
                      ),
                    ],
                  ),
                ),
                if (selected) const Icon(Icons.check_rounded, color: KombeColors.forest, semanticLabel: 'groupe actif'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Badge de fonction (« ★ Trésorier »), or pâle.
class RoleBadge extends StatelessWidget {
  const RoleBadge({super.key, required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: KombeColors.goldPale, borderRadius: BorderRadius.circular(999)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const Icon(Icons.star_rounded, size: 13, color: KombeColors.goldDark),
            const SizedBox(width: 3),
            Text(label, style: const TextStyle(color: KombeColors.goldDark, fontWeight: FontWeight.w700, fontSize: 12)),
          ],
        ),
      );
}

String roleLabel(GroupRole r) => switch (r) {
      GroupRole.member => 'Membre',
      GroupRole.treasurer => 'Trésorerie',
      GroupRole.controller => 'Commissaire aux comptes',
      GroupRole.secretary => 'Secrétariat',
      GroupRole.administrator => 'Présidence',
    };

class MainShell extends StatefulWidget {
  const MainShell({required this.navigationShell, super.key});
  final StatefulNavigationShell navigationShell;

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with WidgetsBindingObserver {
  final GlobalKey<ScaffoldState> _scaffold = GlobalKey<ScaffoldState>();
  int _unread = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_refreshUnread());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Retour au premier plan : compteur et groupes à jour.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_refreshUnread());
      unawaited(context.read<ActiveGroupController>().refresh());
    }
  }

  Future<void> _refreshUnread() async {
    final int n = await context.read<NotificationRepository>().unreadCount();
    if (mounted && n != _unread) setState(() => _unread = n);
  }

  void _goBranch(int index) {
    widget.navigationShell.goBranch(index, initialLocation: index == widget.navigationShell.currentIndex);
    unawaited(_refreshUnread());
  }

  @override
  Widget build(BuildContext context) {
    const List<(String, String)> items = <(String, String)>[
      (KombeIconData.accueil, 'Accueil'),
      (KombeIconData.declarer, 'Cotisations'),
      (KombeIconData.groupes, 'Groupes'),
      (KombeIconData.cloche, 'Activité'),
    ];
    return KombeShellScope(
      openMenu: () => _scaffold.currentState?.openDrawer(),
      unread: _unread,
      refreshUnread: () => unawaited(_refreshUnread()),
      child: Scaffold(
        key: _scaffold,
        drawer: KombeMenu(onNavigate: (String route) {
          Navigator.of(context).pop();
          context.push(route);
        }),
        body: KombeUpdateCheck(child: widget.navigationShell),
        bottomNavigationBar: NavigationBar(
          selectedIndex: widget.navigationShell.currentIndex,
          backgroundColor: Colors.white,
          surfaceTintColor: Colors.transparent,
          indicatorColor: KombeColors.mint,
          height: 72,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected: _goBranch,
          destinations: <Widget>[
            for (int i = 0; i < items.length; i++)
              NavigationDestination(
                icon: _badge(i, KombeIcon(items[i].$1, size: 24, color: KombeColors.slate)),
                selectedIcon: _badge(i, KombeIcon(items[i].$1, size: 24, color: KombeColors.forest)),
                label: items[i].$2,
                tooltip: i == ShellBranch.activity && _unread > 0 ? '${items[i].$2}, $_unread non lues' : items[i].$2,
              ),
          ],
        ),
      ),
    );
  }

  Widget _badge(int branch, Widget icon) => branch == ShellBranch.activity && _unread > 0
      ? Badge(smallSize: 9, backgroundColor: KombeColors.goldWarm, child: icon)
      : icon;
}

/// Menu latéral (planche) : en-tête forêt avec le logo, feuille ivoire
/// arrondie : vos groupes, rejoindre, créer, puis les destinations moins
/// fréquentes. Les tâches courantes restent sur l'accueil et la barre du bas.
class KombeMenu extends StatelessWidget {
  const KombeMenu({super.key, required this.onNavigate});
  final void Function(String route) onNavigate;

  @override
  Widget build(BuildContext context) {
    final ActiveGroupController groups = context.watch<ActiveGroupController>();
    final TextTheme t = Theme.of(context).textTheme;
    return Drawer(
      backgroundColor: KombeColors.forest,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.horizontal(right: Radius.circular(28))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          NdopSurface(
            variant: 2,
            opacity: .16,
            fadeTo: Alignment.centerLeft,
            child: Padding(
              padding: EdgeInsets.fromLTRB(22, MediaQuery.paddingOf(context).top + 18, 16, 22),
              child: const Align(alignment: Alignment.centerLeft, child: KombeLogo(size: 34, inverse: true)),
            ),
          ),
          Expanded(
            // Material (et non DecoratedBox) : les retours tactiles des lignes restent visibles.
            child: Material(
              color: KombeColors.cream,
              shape: const RoundedRectangleBorder(borderRadius: BorderRadius.only(topRight: Radius.circular(28), topLeft: Radius.circular(28))),
              clipBehavior: Clip.antiAlias,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(12, 18, 12, 24),
                children: <Widget>[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 0, 10, 8),
                    child: Text('Vos groupes', style: t.titleSmall?.copyWith(fontWeight: FontWeight.w800, color: KombeColors.ink)),
                  ),
                  for (final GroupSummary g in groups.list)
                    _GroupTile(
                      group: g,
                      selected: g.id == groups.active?.id,
                      onTap: () {
                        unawaited(groups.select(g.id));
                        Navigator.of(context).pop();
                        context.go('/app');
                      },
                    ),
                  const Padding(padding: EdgeInsets.symmetric(horizontal: 10, vertical: 8), child: Divider()),
                  _MenuRow(icon: Icons.person_add_alt_1_outlined, label: 'Rejoindre un groupe', onTap: () => onNavigate('/app/groups/join')),
                  _MenuRow(icon: Icons.add_circle_outline_rounded, label: 'Créer une tontine', onTap: () => onNavigate('/app/groups/create')),
                  const Padding(padding: EdgeInsets.symmetric(horizontal: 10, vertical: 8), child: Divider()),
                  _MenuRow(icon: Icons.how_to_vote_outlined, label: 'Votes et décisions', onTap: () => onNavigate('/app/votes')),
                  _MenuRow(icon: Icons.description_outlined, label: 'Documents', onTap: () => onNavigate('/app/documents')),
                  _MenuRow(icon: Icons.help_outline_rounded, label: 'Aide', onTap: () => onNavigate('/app/help')),
                  _MenuRow(icon: Icons.person_outline_rounded, label: 'Profil et réglages', onTap: () => onNavigate('/app/profile')),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        leading: Icon(icon, color: KombeColors.ink),
        title: Text(label, style: const TextStyle(fontSize: 16)),
        onTap: onTap,
      );
}
