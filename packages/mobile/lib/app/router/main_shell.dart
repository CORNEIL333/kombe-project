import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/design/kombe_colors.dart';
import '../../core/design/kombe_icons.g.dart';
import '../../core/widgets/kombe_icon.dart';
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
                  child: KombeIcon(KombeIconData.declarer, size: 22),
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
                  child: KombeIcon(KombeIconData.balance, size: 22),
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
        backgroundColor: KombeColors.goldDark,
        foregroundColor: Colors.white,
        elevation: 4,
        highlightElevation: 6,
        shape: const CircleBorder(),
        tooltip: 'Action rapide',
        onPressed: () => _showQuickActions(context),
        child: const KombeIcon(KombeIconData.plus, size: 28, color: Colors.white),
      ),
      floatingActionButtonLocation: FloatingActionButtonLocation.centerDocked,
      bottomNavigationBar: BottomAppBar(
        color: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        shadowColor: Colors.transparent,
        notchMargin: 8,
        shape: const CircularNotchedRectangle(),
        padding: EdgeInsets.zero,
        height: 72,
        child: Row(
          children: <Widget>[
            Expanded(
              child: _NavButton(
                selected: navigationShell.currentIndex == 0,
                icon: KombeIconData.accueil,
                label: l10n.home,
                onTap: () => _goBranch(0),
              ),
            ),
            Expanded(
              child: _NavButton(
                selected: navigationShell.currentIndex == 1,
                icon: KombeIconData.groupes,
                label: l10n.groups,
                onTap: () => _goBranch(1),
              ),
            ),
            const SizedBox(width: 68),
            Expanded(
              child: _NavButton(
                selected: navigationShell.currentIndex == 2,
                icon: KombeIconData.cloche,
                label: l10n.notifications,
                onTap: () => _goBranch(2),
              ),
            ),
            Expanded(
              child: _NavButton(
                selected: navigationShell.currentIndex == 3,
                icon: KombeIconData.grille,
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
    required this.label,
    required this.onTap,
  });

  final bool selected;
  /// Icône de la charte (`KombeIconData`).
  final String icon;
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
              AnimatedScale(
                scale: selected ? 1.1 : 1,
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeOutBack,
                child: KombeIcon(icon, size: 24, color: selected ? KombeColors.forest : KombeColors.slate),
              ),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                softWrap: false,
                overflow: TextOverflow.fade,
                style: TextStyle(
                  fontSize: 11.5,
                  letterSpacing: 0,
                  color: selected ? KombeColors.forest : KombeColors.slate,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                ),
              ),
              const SizedBox(height: 3),
              // Nœud « vous êtes ici » (grammaire de l'orbite), pas seulement la couleur.
              AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                width: selected ? 6 : 0,
                height: 6,
                decoration: const BoxDecoration(color: KombeColors.gold, shape: BoxShape.circle),
              ),
            ],
          ),
        ),
      );
}
