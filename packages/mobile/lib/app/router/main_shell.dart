import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';
import '../../l10n/app_localizations.dart';

class MainShell extends StatelessWidget {
  const MainShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  void _goBranch(int index) {
    navigationShell.goBranch(
      index,
      initialLocation: index == navigationShell.currentIndex,
    );
  }

  Future<void> _showQuickActions(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (BuildContext context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              ListTile(
                leading: const CircleAvatar(
                  backgroundColor: KombeColors.mint,
                  foregroundColor: KombeColors.forest,
                  child: Icon(Icons.upload_outlined),
                ),
                title: const Text('Déclarer une cotisation'),
                subtitle: const Text(
                  'Sélectionnez d’abord un groupe réel chargé depuis le serveur.',
                ),
                onTap: () {
                  Navigator.of(context).pop();
                  context.go('/app/groups');
                },
              ),
              ListTile(
                leading: const CircleAvatar(
                  backgroundColor: KombeColors.mint,
                  foregroundColor: KombeColors.forest,
                  child: Icon(Icons.gavel_outlined),
                ),
                title: const Text('Ouvrir un litige'),
                onTap: () {
                  Navigator.of(context).pop();
                  context.push('/app/disputes/new');
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final AppLocalizations l10n = AppLocalizations.of(context);
    return Scaffold(
      body: SafeArea(bottom: false, child: navigationShell),
      floatingActionButton: FloatingActionButton(
        backgroundColor: KombeColors.gold,
        foregroundColor: Colors.white,
        tooltip: 'Action rapide',
        onPressed: () => _showQuickActions(context),
        child: const Icon(Icons.add),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: BottomAppBar(
        color: Colors.white,
        elevation: 12,
        notchMargin: 8,
        shape: const CircularNotchedRectangle(),
        padding: EdgeInsets.zero,
        height: 72,
        child: Row(
          children: <Widget>[
            Expanded(
              child: _NavButton(
                selected: navigationShell.currentIndex == 0,
                icon: Icons.home_outlined,
                selectedIcon: Icons.home,
                label: l10n.home,
                onTap: () => _goBranch(0),
              ),
            ),
            Expanded(
              child: _NavButton(
                selected: navigationShell.currentIndex == 1,
                icon: Icons.groups_outlined,
                selectedIcon: Icons.groups,
                label: l10n.groups,
                onTap: () => _goBranch(1),
              ),
            ),
            const SizedBox(width: 68),
            Expanded(
              child: _NavButton(
                selected: navigationShell.currentIndex == 2,
                icon: Icons.notifications_none,
                selectedIcon: Icons.notifications,
                label: l10n.notifications,
                onTap: () => _goBranch(2),
              ),
            ),
            Expanded(
              child: _NavButton(
                selected: navigationShell.currentIndex == 3,
                icon: Icons.more_horiz,
                selectedIcon: Icons.more,
                label: l10n.more,
                onTap: () => _goBranch(3),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NavButton extends StatelessWidget {
  const _NavButton({
    required this.selected,
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        selected: selected,
        button: true,
        label: label,
        child: InkResponse(
          onTap: onTap,
          radius: 34,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: <Widget>[
              Icon(
                selected ? selectedIcon : icon,
                color: selected ? KombeColors.forest : KombeColors.slate,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: Theme.of(context).textTheme.labelSmall?.copyWith(
                      color: selected ? KombeColors.forest : KombeColors.slate,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                    ),
              ),
            ],
          ),
        ),
      );
}
