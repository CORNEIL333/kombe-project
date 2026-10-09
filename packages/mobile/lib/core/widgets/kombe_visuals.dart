import 'package:flutter/material.dart';

import '../../domain/entities/group.dart';
import '../design/kombe_colors.dart';
import '../design/kombe_tokens.g.dart';
import '../formatters/labels.dart';

/// Photographies d'ambiance de la marque (décor, jamais une donnée métier :
/// aucune ne représente un membre réel ni un montant).
abstract final class KombePhotos {
  static const String heroCircle = 'assets/images/hero-cercle.jpg';
  static const String circleTop = 'assets/images/cercle-vue-dessus.jpg';
  static const String handsPhone = 'assets/images/mains-telephone.jpg';
  static const String treasurer = 'assets/images/tresoriere.jpg';
  static const String street = 'assets/images/quartier.jpg';
  static const String decision = 'assets/images/decision.jpg';
  static const String handover = 'assets/images/tour-beneficiaire.jpg';
  static const String generations = 'assets/images/generations.jpg';
  static const String portrait = 'assets/images/onboarding-portrait.jpg';

  /// Couverture par défaut d'un groupe sans photo serveur : stable pour un même groupe.
  static const List<String> _covers = <String>[heroCircle, circleTop, decision, generations, handover, street];
  static String coverFor(String groupId) => _covers[groupId.hashCode.abs() % _covers.length];
}

/// Avatar : la photo du serveur si elle existe, sinon les initiales.
/// Jamais un visage inventé pour une vraie personne.
class KombeAvatar extends StatelessWidget {
  const KombeAvatar({required this.name, super.key, this.url, this.size = 44});
  final String name;
  final Uri? url;
  final double size;

  String get _initials {
    final List<String> parts = name.trim().split(RegExp(r'\s+')).where((String p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return parts.take(2).map((String p) => p.characters.first.toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    final Widget initials = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: const BoxDecoration(color: KombeColors.sand, shape: BoxShape.circle),
      child: Text(
        _initials,
        style: TextStyle(color: KombeColors.forest, fontWeight: FontWeight.w800, fontSize: size * .34),
      ),
    );
    final Uri? u = url;
    if (u == null) return ExcludeSemantics(child: initials);
    return ExcludeSemantics(
      child: ClipOval(
        child: Image.network(
          u.toString(),
          width: size,
          height: size,
          fit: BoxFit.cover,
          errorBuilder: (BuildContext context, Object error, StackTrace? stack) => initials,
        ),
      ),
    );
  }
}

enum ChipTone { gold, green, neutral, warning, danger }

/// Pastille (rôle, statut). Toujours un texte ; l'icône est un appoint.
class KombeChip extends StatelessWidget {
  const KombeChip({required this.label, super.key, this.tone = ChipTone.green, this.icon});
  final String label;
  final ChipTone tone;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg) = switch (tone) {
      ChipTone.gold => (KombeTokens.gold100, KombeTokens.gold800),
      ChipTone.green => (KombeTokens.forest50, KombeTokens.forest800),
      ChipTone.neutral => (KombeTokens.sand100, KombeTokens.ink700),
      ChipTone.warning => (KombeTokens.warningSurface, KombeTokens.warning),
      ChipTone.danger => (KombeTokens.dangerSurface, KombeTokens.danger),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icon != null) ...<Widget>[Icon(icon, size: 14, color: tone == ChipTone.gold ? KombeColors.gold : fg), const SizedBox(width: 4)],
          Text(label, style: TextStyle(color: fg, fontSize: 12.5, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}

/// Pastille de rôle : le trésorier en or avec une étoile (maquettes), les autres en vert.
class RoleChip extends StatelessWidget {
  const RoleChip({required this.role, super.key});
  final GroupRole role;

  @override
  Widget build(BuildContext context) => role == GroupRole.member
      ? KombeChip(label: KombeLabels.role(role))
      : KombeChip(label: KombeLabels.role(role), tone: ChipTone.gold, icon: Icons.star_rounded);
}

/// Photo de couverture arrondie (groupe), avec repli sur une photo de marque.
class CoverImage extends StatelessWidget {
  const CoverImage({required this.groupId, super.key, this.url, this.width = 96, this.height = 96, this.radius = 16});
  final String groupId;
  final Uri? url;
  final double width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final Widget fallback = Image.asset(KombePhotos.coverFor(groupId), width: width, height: height, fit: BoxFit.cover);
    final Uri? u = url;
    return ExcludeSemantics(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: u == null
            ? fallback
            : Image.network(u.toString(), width: width, height: height, fit: BoxFit.cover,
                errorBuilder: (BuildContext c, Object e, StackTrace? s) => fallback),
      ),
    );
  }
}

/// Fond photo + voile forêt dégradé : lisibilité garantie du texte blanc posé dessus.
class PhotoBackdrop extends StatelessWidget {
  const PhotoBackdrop({required this.asset, required this.child, super.key, this.alignment = Alignment.center, this.strength = .88});
  final String asset;
  final Widget child;
  final Alignment alignment;
  final double strength;

  @override
  Widget build(BuildContext context) => Stack(
        fit: StackFit.passthrough,
        children: <Widget>[
          Positioned.fill(child: ExcludeSemantics(child: Image.asset(asset, fit: BoxFit.cover, alignment: alignment))),
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.centerLeft,
                  end: Alignment.centerRight,
                  colors: <Color>[
                    KombeColors.forestDark.withValues(alpha: strength),
                    KombeColors.forest.withValues(alpha: strength - .12),
                    KombeColors.forest.withValues(alpha: strength - .38),
                  ],
                ),
              ),
            ),
          ),
          child,
        ],
      );
}

/// Pastille « Cycle 4/12 » sur fond sombre.
class CycleBadge extends StatelessWidget {
  const CycleBadge({required this.index, required this.total, super.key});
  final int index;
  final int total;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: .12),
          borderRadius: BorderRadius.circular(99),
          border: Border.all(color: Colors.white.withValues(alpha: .35)),
        ),
        child: Text('Cycle $index/$total', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
      );
}
