import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';

class KombeListRow extends StatelessWidget {
  const KombeListRow({
    required this.icon,
    required this.title,
    super.key,
    this.subtitle,
    this.trailing,
    this.onTap,
    this.iconColor = KombeColors.forest,
  });

  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      minTileHeight: 64,
      contentPadding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
      leading: CircleAvatar(
        backgroundColor: iconColor.withValues(alpha: .1),
        foregroundColor: iconColor,
        child: Icon(icon),
      ),
      title: Text(title, style: Theme.of(context).textTheme.titleMedium),
      subtitle: subtitle == null
          ? null
          : Text(subtitle!, style: Theme.of(context).textTheme.bodySmall),
      trailing: trailing ?? (onTap == null ? null : const Icon(Icons.chevron_right)),
      onTap: onTap,
    );
  }
}
