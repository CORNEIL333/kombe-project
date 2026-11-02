import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/repositories/group_repository.dart';
import '../design/kombe_colors.dart';
import '../design/kombe_ndop.dart';

const Set<String> _motsVides = <String>{'le', 'la', 'les', 'l', 'de', 'des', 'du', 'd', 'et', 'the', 'of', 'and', 'a', 'à', 'au', 'aux'};

/// « Les Étoiles de Yaoundé » → « ÉY » (mêmes règles que la PWA).
String groupInitials(String name) {
  final List<String> words =
      name.trim().split(RegExp(r"[\s'’-]+")).where((String w) => w.isNotEmpty && !_motsVides.contains(w.toLowerCase())).toList();
  final String first = words.isNotEmpty ? words[0][0] : (name.trim().isNotEmpty ? name.trim()[0] : 'K');
  final String second = words.length > 1 ? words[1][0] : '';
  return (first + second).toUpperCase();
}

/// Cache mémoire par version : une photo changée a une nouvelle clé.
final Map<String, Future<Uint8List?>> _cache = <String, Future<Uint8List?>>{};

void forgetGroupPhoto(String groupId) => _cache.removeWhere((String k, _) => k.startsWith('$groupId:'));

/// Avatar d'une tontine : sa photo (lue avec la session, jamais par une URL
/// publique) ou ses initiales sur motif Ndop, dans l'anneau or à 4 nœuds. Aucune photo d'illustration
/// n'est jamais affichée à la place du groupe.
class GroupAvatar extends StatelessWidget {
  const GroupAvatar({super.key, required this.groupId, required this.name, this.photoVersion, this.size = 40, this.round = false});

  final String groupId;
  final String name;
  final int? photoVersion;
  final double size;
  final bool round;

  @override
  Widget build(BuildContext context) {
    final BorderRadius radius = BorderRadius.circular(round ? size : size * 0.28);
    final Widget fallback = _Initials(seed: groupId, name: name, size: size, radius: radius);
    final int? v = photoVersion;
    if (v == null) return ExcludeSemantics(child: fallback);
    GroupRepository? repo;
    try {
      repo = context.read<GroupRepository>();
    } on ProviderNotFoundException {
      return ExcludeSemantics(child: fallback);
    }
    final int px = size > 96 ? 512 : 256;
    final Future<Uint8List?> bytes = _cache.putIfAbsent('$groupId:$v:$px', () => repo!.loadPhoto(groupId, v, px));
    return ExcludeSemantics(
      child: FutureBuilder<Uint8List?>(
        future: bytes,
        builder: (BuildContext context, AsyncSnapshot<Uint8List?> snap) {
          final Uint8List? data = snap.data;
          if (data == null) return fallback;
          return ClipRRect(
            borderRadius: radius,
            child: Image.memory(data, width: size, height: size, fit: BoxFit.cover, gaplessPlayback: true, cacheWidth: (size * 3).round()),
          );
        },
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.seed, required this.name, required this.size, required this.radius});
  final String seed;
  final String name;
  final double size;
  final BorderRadius radius;

  @override
  Widget build(BuildContext context) {
    // Variante stable par groupe : motif et teinte (forêt, jade, nuit).
    final int h = seed.codeUnits.fold<int>(7, (int a, int c) => (a * 31 + c) & 0x7fffffff);
    const List<Color> fonds = <Color>[KombeColors.forest, Color(0xFF145140), KombeColors.forestDark];
    return SizedBox.square(
      dimension: size,
      child: NdopSurface(
        color: fonds[h % 3],
        variant: h % 3,
        opacity: size >= 64 ? .16 : .12,
        tile: (size / 3.2).clamp(9, 30),
        fadeTo: null,
        borderRadius: radius,
        child: CustomPaint(
          painter: size >= 40 ? _RingPainter() : null,
          size: Size.square(size),
          child: Center(
            child: Text(
              groupInitials(name),
              style: TextStyle(color: KombeColors.cream, fontWeight: FontWeight.w800, fontSize: size * .34, height: 1, letterSpacing: size * .01),
            ),
          ),
        ),
      ),
    );
  }
}

/// Anneau or à quatre nœuds (le logo) autour des initiales.
class _RingPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final Offset c = size.center(Offset.zero);
    final double r = size.shortestSide * .33;
    final Paint ring = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.2, size.shortestSide * .028)
      ..color = KombeColors.goldWarm.withValues(alpha: .8);
    // Fond uni sous les initiales : le motif ne gêne jamais la lecture.
    canvas.drawCircle(c, r, Paint()..color = const Color(0x66061F1B));
    canvas.drawCircle(c, r, ring);
    final Paint node = Paint()..color = KombeColors.goldWarm;
    for (int k = 0; k < 4; k++) {
      final double a = k * math.pi / 2 - math.pi / 4;
      canvas.drawCircle(c + Offset(math.cos(a), math.sin(a)) * r, size.shortestSide * .035, node);
    }
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) => false;
}
