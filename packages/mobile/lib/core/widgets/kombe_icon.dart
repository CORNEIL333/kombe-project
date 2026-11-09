import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../design/kombe_colors.dart';

/// Icône de la charte (trait arrondi, grille 24) — mêmes dessins que le site
/// et la PWA (source : packages/brand/icons/kombe-icons.json, générée dans
/// kombe_icons.g.dart). Décorative : le libellé voisin porte le sens.
class KombeIcon extends StatelessWidget {
  const KombeIcon(this.svg, {super.key, this.size = 24, this.color});

  /// Une constante de `KombeIconData` (ex. `KombeIconData.accueil`).
  final String svg;
  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: SvgPicture.string(
          svg,
          width: size,
          height: size,
          colorFilter: ColorFilter.mode(color ?? IconTheme.of(context).color ?? KombeColors.forest, BlendMode.srcIn),
        ),
      );
}

/// Pastille sable de la charte (icône dans un cercle doux).
class KombePastille extends StatelessWidget {
  const KombePastille(this.svg, {super.key, this.size = 48, this.fond = KombeColors.sand, this.couleur = KombeColors.forest});
  final String svg;
  final double size;
  final Color fond;
  final Color couleur;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: fond, shape: BoxShape.circle),
        child: KombeIcon(svg, size: size * .46, color: couleur),
      );
}
