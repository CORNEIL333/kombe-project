import 'package:flutter/material.dart';

import '../../domain/entities/group.dart';
import '../design/kombe_colors.dart';
import '../design/kombe_ndop.dart';
import '../formatters/xaf.dart';
import 'group_avatar.dart';
import 'kombe_components.dart';

/// Carte héro d'un groupe : surface forêt au motif Ndop, identité du groupe
/// (sa photo ou ses initiales — jamais une photo d'ambiance), anneau du
/// cycle, part de cotisation.
class GroupHeroCard extends StatelessWidget {
  const GroupHeroCard({required this.group, super.key, this.onTap, this.eyebrow});

  final GroupSummary group;
  final VoidCallback? onTap;

  /// Sur-titre optionnel (ex. « Mon groupe principal »).
  final String? eyebrow;

  @override
  Widget build(BuildContext context) {
    final TextStyle soft = TextStyle(color: KombeColors.cream.withValues(alpha: .78), fontSize: 13.5);
    return Semantics(
      button: onTap != null,
      label: '${group.name}, tour ${group.cycleIndex} sur ${group.cycleTotal}, '
          '${group.memberCount} membres, cotisation ${Xaf.format(group.contributionAmountXaf)}',
      child: ExcludeSemantics(
        child: NdopSurface(
          opacity: .16,
          tile: 30,
          fadeTo: Alignment.centerLeft,
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
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
                              if (eyebrow != null) Text(eyebrow!, style: soft),
                              Text(
                                group.name,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(fontFamily: 'Fraunces', color: KombeColors.cream, fontSize: 22, fontWeight: FontWeight.w600, height: 1.15),
                              ),
                              const SizedBox(height: 2),
                              Text('${group.memberCount} membres', style: soft),
                            ],
                          ),
                        ),
                        if (onTap != null) Icon(Icons.chevron_right_rounded, color: KombeColors.cream.withValues(alpha: .8)),
                      ],
                    ),
                    const SizedBox(height: 18),
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: <Widget>[
                              Text('PART DE COTISATION', style: soft.copyWith(fontSize: 11.5, fontWeight: FontWeight.w800, letterSpacing: 1.1, color: KombeColors.goldLight)),
                              const SizedBox(height: 6),
                              FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerLeft,
                                child: KombeAmount(group.contributionAmountXaf, size: 30, color: KombeColors.cream),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    KombeCycleBand(index: group.cycleIndex, total: group.cycleTotal, onDark: true),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
