import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_icons.g.dart';
import '../../core/update/kombe_update_sheet.dart';
import '../../core/widgets/kombe_icon.dart';
import '../../core/widgets/kombe_visuals.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/notification_repository.dart';
import '../active_group_controller.dart';

/// Branches du shell (ordre fixe, voir `AppRouter`).
abstract final class ShellBranch {
  static const int home = 0;
  static const int contributions = 1;
  static const int activity = 2;
  static const int bureau = 3;
}

/// Ouvre le menu latéral depuis n'importe quel écran d'onglet (chaque onglet
/// a son propre Scaffold ; le menu appartient au shell).
class KombeShellScope extends InheritedWidget {
  const KombeShellScope({super.key, required this.openMenu, required this.unread, required super.child});
  final VoidCallback openMenu;
  final int unread;

  static KombeShellScope? of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<KombeShellScope>();

  @override
  bool updateShouldNotify(KombeShellScope old) => old.unread != unread;
}

/// Barre supérieure épurée des onglets : menu à gauche, titre, actions
/// contextuelles à droite (cibles de 48 dp, libellées pour les lecteurs d'écran).
class KombeTopBar extends StatelessWidget implements PreferredSizeWidget {
  const KombeTopBar({super.key, required this.title, this.actions = const <Widget>[]});
  final Widget title;
  final List<Widget> actions;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final KombeShellScope? shell = KombeShellScope.of(context);
    return AppBar(
      automaticallyImplyLeading: false,
      titleSpacing: shell == null ? null : 0,
      leading: shell == null
          ? null
          : IconButton(
              tooltip: 'Menu',
              onPressed: shell.openMenu,
              icon: const KombeIcon(KombeIconData.menu, size: 24, color: KombeColors.ink),
            ),
      title: title,
      actions: <Widget>[...actions, const SizedBox(width: 4)],
    );
  }
}

/// Sélecteur du groupe actif (titre de l'accueil) : ouvre la liste des
/// groupes en demi-fenêtre.
class ActiveGroupTitle extends StatelessWidget {
  const ActiveGroupTitle({super.key});

  @override
  Widget build(BuildContext context) {
    final ActiveGroupController groups = context.watch<ActiveGroupController>();
    final GroupSummary? g = groups.active;
    final TextTheme t = Theme.of(context).textTheme;
    if (g == null) return Text('KÓMBE', style: t.titleLarge);
    final bool several = groups.list.length > 1;
    return Semantics(
      button: several,
      label: several ? 'Groupe actif : ${g.name}. Changer de groupe' : 'Groupe : ${g.name}',
      excludeSemantics: true,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: several ? () => showGroupSwitcher(context) : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Flexible(child: Text(g.name, overflow: TextOverflow.ellipsis, style: t.titleMedium?.copyWith(fontWeight: FontWeight.w800))),
              if (several) const Icon(Icons.expand_more_rounded, size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

/// Changer de groupe sans quitter l'écran.
Future<void> showGroupSwitcher(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: KombeColors.cream,
      builder: (BuildContext sheet) {
        final ActiveGroupController groups = sheet.watch<ActiveGroupController>();
        return SafeArea(
          child: ListView(
            shrinkWrap: true,
            padding: const EdgeInsets.only(bottom: 12),
            children: <Widget>[
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text('Vos groupes', style: Theme.of(sheet).textTheme.titleLarge),
              ),
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
          ),
        );
      },
    );

class _GroupTile extends StatelessWidget {
  const _GroupTile({required this.group, required this.selected, required this.onTap});
  final GroupSummary group;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ListTile(
        selected: selected,
        selectedTileColor: KombeColors.mint,
        leading: KombeAvatar(name: group.name, size: 40),
        title: Text(group.name, maxLines: 1, overflow: TextOverflow.ellipsis),
        subtitle: Text(_roleLabel(group.role)),
        trailing: selected ? const Icon(Icons.check_rounded, color: KombeColors.forest, semanticLabel: 'groupe actif') : null,
        onTap: onTap,
      );
}

String _roleLabel(GroupRole r) => switch (r) {
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
    final bool bureau = context.watch<ActiveGroupController>().isBureau;
    final List<(int, String, String)> items = <(int, String, String)>[
      (ShellBranch.home, KombeIconData.accueil, 'Accueil'),
      (ShellBranch.contributions, KombeIconData.declarer, 'Cotisations'),
      (ShellBranch.activity, KombeIconData.cloche, 'Activité'),
      if (bureau) (ShellBranch.bureau, KombeIconData.bureau, 'Bureau'),
    ];
    final int current = widget.navigationShell.currentIndex;
    final int selected = items.indexWhere(((int, String, String) i) => i.$1 == current);
    return KombeShellScope(
      openMenu: () => _scaffold.currentState?.openDrawer(),
      unread: _unread,
      child: Scaffold(
        key: _scaffold,
        drawer: KombeMenu(onNavigate: (String route) {
          Navigator.of(context).pop();
          context.push(route);
        }),
        body: KombeUpdateCheck(child: widget.navigationShell),
        bottomNavigationBar: NavigationBar(
          selectedIndex: selected < 0 ? 0 : selected,
          backgroundColor: Colors.white,
          indicatorColor: KombeColors.mint,
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          onDestinationSelected: (int i) => _goBranch(items[i].$1),
          destinations: <Widget>[
            for (final (int branch, String icon, String label) in items)
              NavigationDestination(
                icon: _badge(branch, KombeIcon(icon, size: 24, color: KombeColors.slate)),
                selectedIcon: _badge(branch, KombeIcon(icon, size: 24, color: KombeColors.forest)),
                label: label,
                tooltip: branch == ShellBranch.activity && _unread > 0 ? '$label, $_unread non lues' : label,
              ),
          ],
        ),
      ),
    );
  }

  Widget _badge(int branch, Widget icon) => branch == ShellBranch.activity && _unread > 0
      ? Badge(label: Text(_unread > 99 ? '99+' : '$_unread'), child: icon)
      : icon;
}

/// Menu latéral : vos groupes (changer, rejoindre, créer) puis les
/// destinations moins fréquentes. Les tâches courantes restent sur l'accueil
/// et la barre du bas — le menu n'est pas un placard.
class KombeMenu extends StatelessWidget {
  const KombeMenu({super.key, required this.onNavigate});
  final void Function(String route) onNavigate;

  @override
  Widget build(BuildContext context) {
    final ActiveGroupController groups = context.watch<ActiveGroupController>();
    final TextTheme t = Theme.of(context).textTheme;
    return NavigationDrawer(
      backgroundColor: KombeColors.cream,
      children: <Widget>[
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 16, 8),
          child: Text('Vos groupes', style: t.titleSmall?.copyWith(color: KombeColors.slate)),
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
        _MenuRow(icon: Icons.group_add_outlined, label: 'Rejoindre un groupe', onTap: () => onNavigate('/app/groups/join')),
        _MenuRow(icon: Icons.add_circle_outline_rounded, label: 'Créer une tontine', onTap: () => onNavigate('/app/groups/create')),
        const Padding(padding: EdgeInsets.symmetric(horizontal: 24, vertical: 8), child: Divider()),
        _MenuRow(icon: Icons.how_to_vote_outlined, label: 'Votes et décisions', onTap: () => onNavigate('/app/votes')),
        _MenuRow(icon: Icons.description_outlined, label: 'Documents', onTap: () => onNavigate('/app/documents')),
        _MenuRow(icon: Icons.help_outline_rounded, label: 'Aide', onTap: () => onNavigate('/app/help')),
        _MenuRow(icon: Icons.person_outline_rounded, label: 'Profil et réglages', onTap: () => onNavigate('/app/profile')),
      ],
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: ListTile(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(28)),
          leading: Icon(icon, color: KombeColors.ink),
          title: Text(label),
          onTap: onTap,
        ),
      );
}
