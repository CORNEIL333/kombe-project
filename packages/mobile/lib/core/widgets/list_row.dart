import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import 'kombe_components.dart';

/// Rangée de liste : picto teinté, titre, détail, valeur ou chevron.
class KombeListRow extends StatelessWidget {
  const KombeListRow({
    required this.icon,
    required this.title,
    super.key,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.tone = KombeTone.brand,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final KombeTone tone;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 68,
      leading: KombeIconBadge(icon, tone: tone),
      title: Text(title),
      subtitle: subtitle == null ? null : Text(subtitle!),
      trailing: trailing ?? (onTap == null ? null : const Icon(Icons.chevron_right_rounded, color: KombeColors.slate)),
      onTap: onTap,
    );
  }
}
