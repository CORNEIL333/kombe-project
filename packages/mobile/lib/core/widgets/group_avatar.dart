import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/repositories/group_repository.dart';
import '../design/kombe_colors.dart';

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
/// publique) ou ses initiales sur l'anneau KÓMBE. Aucune photo d'illustration
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
    final Widget fallback = _Initials(name: name, size: size, radius: radius);
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
  const _Initials({required this.name, required this.size, required this.radius});
  final String name;
  final double size;
  final BorderRadius radius;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        // Grande couverture : tissage de la marque sous un voile forêt (planche) ;
        // petit avatar : anneau. Jamais une photo de personnes.
        decoration: BoxDecoration(
          color: KombeColors.forest,
          borderRadius: radius,
          image: size >= 64
              ? const DecorationImage(
                  image: AssetImage('assets/images/fonds/creation.webp'),
                  fit: BoxFit.cover,
                  colorFilter: ColorFilter.mode(Color(0x99103C32), BlendMode.srcATop),
                )
              : null,
        ),
        child: CustomPaint(
          painter: size >= 64 ? null : _RingPainter(),
          child: Center(
            child: Text(
              groupInitials(name),
              style: TextStyle(color: KombeColors.cream, fontWeight: FontWeight.w800, fontSize: size * 0.36, height: 1),
            ),
          ),
        ),
      );
}

/// Anneau de la marque (motif vectoriel du repli).
class _RingPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawCircle(
      size.center(Offset.zero),
      size.shortestSide * 0.34,
      Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = size.shortestSide * 0.06
        ..color = KombeColors.goldWarm.withValues(alpha: .38),
    );
  }

  @override
  bool shouldRepaint(covariant _RingPainter oldDelegate) => false;
}
