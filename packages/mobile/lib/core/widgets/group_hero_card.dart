import 'package:flutter/material.dart';

import '../../domain/entities/group.dart';
import '../design/kombe_colors.dart';
import '../design/kombe_theme.dart';
import '../formatters/xaf.dart';
import 'group_avatar.dart';
import 'kombe_components.dart';

/// Carte d'un groupe : photo ou monogramme, nom, part de cotisation.
class GroupHeroCard extends StatelessWidget {
  const GroupHeroCard({required this.group, super.key, this.onTap, this.eyebrow});

  final GroupSummary group;
  final VoidCallback? onTap;

  /// Sur-titre optionnel (ex. « Mon groupe principal »).
  final String? eyebrow;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      label: '${group.name}, tour ${group.cycleIndex} sur ${group.cycleTotal}, '
          '${group.memberCount} membres, cotisation ${Xaf.format(group.contributionAmountXaf)}',
      child: ExcludeSemantics(
        child: KombeCard(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                children: <Widget>[
                  GroupAvatar(groupId: group.id, name: group.name, photoVersion: group.photoVersion, size: 52),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        if (eyebrow != null) Text(eyebrow!, style: Theme.of(context).textTheme.bodySmall),
                        Text(group.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: KombeType.display(size: 22, color: KombeColors.ink)),
                        Text('${group.memberCount} membres', style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ),
                  ),
                  if (onTap != null) const Icon(Icons.chevron_right_rounded, color: KombeColors.slate),
                ],
              ),
              const SizedBox(height: 14),
              Text('Part de cotisation', style: Theme.of(context).textTheme.bodySmall),
              FittedBox(fit: BoxFit.scaleDown, alignment: Alignment.centerLeft, child: KombeAmount(group.contributionAmountXaf, size: 28, color: KombeColors.ink)),
            ],
          ),
        ),
      ),
    );
  }
}
