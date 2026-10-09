import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_tokens.g.dart';

/// Étapes d'un parcours, dans la grammaire « trajectoire » : des nœuds reliés
/// par un chemin. Fait = nœud forêt coché · en cours = nœud or + halo ·
/// à venir = nœud creux. Le libellé reste toujours écrit (jamais la couleur seule).
class StepIndicator extends StatelessWidget {
  const StepIndicator({
    required this.current,
    required this.labels,
    super.key,
  });

  final int current;
  final List<String> labels;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Semantics(
      label: 'Étape ${current + 1} sur ${labels.length}: ${labels[current]}',
      child: ExcludeSemantics(
        child: Column(
          children: <Widget>[
            Row(
              children: <Widget>[
                for (int i = 0; i < labels.length; i++) ...<Widget>[
                  _Node(state: i < current ? _S.done : i == current ? _S.current : _S.future),
                  if (i < labels.length - 1)
                    Expanded(
                      child: AnimatedContainer(
                        duration: KombeMotion.spatial,
                        curve: KombeEasing.standard,
                        height: 2,
                        margin: const EdgeInsets.symmetric(horizontal: 6),
                        color: i < current ? KombeColors.forest : KombeColors.lineStrong,
                      ),
                    ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: <Widget>[
                for (int i = 0; i < labels.length; i++)
                  Expanded(
                    child: Text(
                      labels[i],
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: i == 0
                          ? TextAlign.start
                          : i == labels.length - 1
                              ? TextAlign.end
                              : TextAlign.center,
                      style: t.labelMedium?.copyWith(
                        color: i == current ? KombeColors.forest : KombeColors.slate,
                        fontWeight: i == current ? FontWeight.w800 : FontWeight.w600,
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum _S { done, current, future }

class _Node extends StatelessWidget {
  const _Node({required this.state});
  final _S state;

  @override
  Widget build(BuildContext context) => AnimatedContainer(
        duration: KombeMotion.ui,
        curve: KombeEasing.standard,
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: switch (state) {
            _S.done => KombeColors.forest,
            _S.current => KombeColors.gold,
            _S.future => Colors.white,
          },
          border: Border.all(
            color: state == _S.future ? KombeColors.lineStrong : Colors.transparent,
            width: 2,
          ),
          boxShadow: state == _S.current
              ? <BoxShadow>[BoxShadow(color: KombeColors.gold.withValues(alpha: .25), spreadRadius: 6)]
              : null,
        ),
        child: state == _S.done ? const Icon(Icons.check_rounded, size: 16, color: KombeColors.cream) : null,
      );
}
