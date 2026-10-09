import 'package:flutter/material.dart';

import '../design/kombe_colors.dart';
import '../design/kombe_tokens.g.dart';

/// Carte « avant d'agir » (mandat §50) : ce qui va se passer, qui le verra,
/// qui doit valider. Ne contient que des faits garantis par le serveur.
class TransparencyCard extends StatelessWidget {
  const TransparencyCard({required this.rows, super.key, this.leading});
  final List<(String, String)> rows;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    final TextTheme t = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: KombeColors.sand,
        borderRadius: BorderRadius.circular(KombeTokens.radiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          if (leading != null) ...<Widget>[leading!, const SizedBox(height: 12)],
          for (int i = 0; i < rows.length; i++)
            Padding(
              padding: EdgeInsets.only(top: i == 0 ? 0 : 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  Text(rows[i].$1.toUpperCase(), style: t.labelSmall),
                  const SizedBox(height: 2),
                  Text(rows[i].$2, style: t.bodyMedium?.copyWith(color: KombeColors.ink)),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
