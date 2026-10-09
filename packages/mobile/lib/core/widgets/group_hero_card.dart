import 'package:flutter/material.dart';

import '../../domain/entities/group.dart';
import '../design/kombe_colors.dart';
import '../formatters/xaf.dart';
import 'kombe_visuals.dart';

/// Carte héro d'un groupe (maquettes « Tableau de bord » / « Cycle ») :
/// photo de la marque sous un voile forêt, nom, cycle, membres, montant.
class GroupHeroCard extends StatelessWidget {
  const GroupHeroCard({required this.group, super.key, this.onTap, this.eyebrow});

  final GroupSummary group;
  final VoidCallback? onTap;

  /// Sur-titre optionnel (ex. « Mon groupe principal »).
  final String? eyebrow;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Semantics(
      button: onTap != null,
      label: '${group.name}, cycle ${group.cycleIndex} sur ${group.cycleTotal}, '
          '${group.memberCount} membres, cotisation ${Xaf.format(group.contributionAmountXaf)}',
      child: ExcludeSemantics(
        child: Material(
          color: KombeColors.forest,
          borderRadius: BorderRadius.circular(22),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: PhotoBackdrop(
              asset: KombePhotos.coverFor(group.id),
              alignment: const Alignment(.4, 0),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 18, 16, 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        if (eyebrow != null) ...<Widget>[
                          const Icon(Icons.groups_rounded, color: Colors.white, size: 20),
                          const SizedBox(width: 8),
                          Expanded(child: Text(eyebrow!, style: t.bodyMedium?.copyWith(color: Colors.white))),
                        ] else
                          Expanded(
                            child: Text(group.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.titleLarge?.copyWith(color: Colors.white, fontSize: 22)),
                          ),
                        CycleBadge(index: group.cycleIndex, total: group.cycleTotal),
                      ],
                    ),
                    if (eyebrow != null) ...<Widget>[
                      const SizedBox(height: 10),
                      Row(
                        children: <Widget>[
                          Expanded(
                            child: Text(group.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: t.titleLarge?.copyWith(color: Colors.white, fontSize: 22)),
                          ),
                          if (onTap != null) const Icon(Icons.chevron_right_rounded, color: Colors.white),
                        ],
                      ),
                    ],
                    const SizedBox(height: 6),
                    Text('${group.memberCount} membres', style: t.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: .85))),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: Container(height: 1, width: 220, color: Colors.white.withValues(alpha: .18)),
                    ),
                    Text('Montant de la cotisation', style: t.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: .85))),
                    const SizedBox(height: 4),
                    Text(
                      Xaf.format(group.contributionAmountXaf),
                      style: t.headlineLarge?.copyWith(color: Colors.white, fontSize: 30, fontFeatures: const <FontFeature>[FontFeature.tabularFigures()]),
                    ),
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
