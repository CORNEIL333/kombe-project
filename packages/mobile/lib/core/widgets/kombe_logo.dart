import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import 'kombe_mark.dart';

/// Logotype KÓMBE : signe à anneau + mot-symbole + signature canonique
/// « Votre tontine, plus claire. » (l'ancien emblème « personnes » est retiré).
class KombeLogo extends StatelessWidget {
  const KombeLogo({super.key, this.compact = false, this.size = 48});

  final bool compact;
  final double size;

  @override
  Widget build(BuildContext context) {
    final Widget mark = KombeMark(size: size);
    if (compact) return Semantics(label: 'KÓMBE', image: true, child: ExcludeSemantics(child: mark));
    return Semantics(
      label: 'KÓMBE — Votre tontine, plus claire.',
      header: true,
      child: ExcludeSemantics(
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            mark,
            SizedBox(width: size * .24),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  'KÓMBE',
                  style: TextStyle(
                    color: KombeColors.forest,
                    fontWeight: FontWeight.w800,
                    fontSize: size * .5,
                    letterSpacing: size * .03,
                    height: 1.05,
                  ),
                ),
                Text(
                  'Votre tontine, plus claire.',
                  style: TextStyle(color: KombeColors.emerald, fontSize: (size * .24).clamp(11, 16), fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
