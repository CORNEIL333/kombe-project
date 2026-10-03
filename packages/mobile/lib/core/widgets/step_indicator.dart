import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';

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
    return Semantics(
      label: 'Étape ${current + 1} sur ${labels.length}: ${labels[current]}',
      child: Row(
        children: <Widget>[
          for (int i = 0; i < labels.length; i++) ...<Widget>[
            Expanded(
              child: Column(
                children: <Widget>[
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    width: 34,
                    height: 34,
                    decoration: BoxDecoration(
                      color: i <= current ? KombeColors.forest : Colors.transparent,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: i <= current ? KombeColors.forest : KombeColors.line,
                      ),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '${i + 1}',
                      style: TextStyle(
                        color: i <= current ? Colors.white : KombeColors.slate,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    labels[i],
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: i == current ? KombeColors.forest : KombeColors.slate,
                          fontWeight: i == current ? FontWeight.w800 : FontWeight.w500,
                        ),
                  ),
                ],
              ),
            ),
            if (i < labels.length - 1)
              Container(
                width: 28,
                height: 1,
                color: i < current ? KombeColors.forest : KombeColors.line,
              ),
          ],
        ],
      ),
    );
  }
}
