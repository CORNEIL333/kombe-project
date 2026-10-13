import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_tokens.g.dart';

/// Étapes d'un parcours (maquette « Déclarer une cotisation ») : numéros dans
/// des cercles reliés par un trait. Fait = coché, en cours = plein vert,
/// à venir = contour. Le libellé reste toujours écrit.
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
                  _Node(number: i + 1, done: i < current, active: i == current),
                  if (i < labels.length - 1)
                    Expanded(
                      child: AnimatedContainer(
                        duration: KombeMotion.spatial,
                        height: 2,
                        margin: const EdgeInsets.symmetric(horizontal: 8),
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
                      textAlign: i == 0 ? TextAlign.start : i == labels.length - 1 ? TextAlign.end : TextAlign.center,
                      style: t.bodySmall?.copyWith(
                        color: i == current ? KombeColors.forest : KombeColors.slate,
                        fontWeight: i == current ? FontWeight.w800 : FontWeight.w500,
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

class _Node extends StatelessWidget {
  const _Node({required this.number, required this.done, required this.active});
  final int number;
  final bool done;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final bool filled = done || active;
    return AnimatedContainer(
      duration: KombeMotion.ui,
      width: 34,
      height: 34,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: filled ? KombeColors.forest : Colors.white,
        border: Border.all(color: filled ? Colors.transparent : KombeColors.lineStrong, width: 1.5),
      ),
      child: done
          ? const Icon(Icons.check_rounded, size: 18, color: Colors.white)
          : Text('$number', style: TextStyle(fontWeight: FontWeight.w800, color: filled ? Colors.white : KombeColors.slate)),
    );
  }
}
