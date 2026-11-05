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

/// Teinte propre à une tontine, stable : on reconnaît un groupe à sa couleur
/// et à son motif, comme un pagne d'association.
class GroupHue {
  const GroupHue(this.bg, this.accent, this.variant);
  final Color bg;
  final Color accent;
  final int variant;
}

const List<GroupHue> _hues = <GroupHue>[
  GroupHue(KombeColors.forest, KombeColors.goldWarm, 2),
  GroupHue(Color(0xFFB02410), KombeColors.goldLight, 2),
  GroupHue(Color(0xFF0A6B49), KombeColors.goldLight, 2),
  GroupHue(KombeColors.emerald, KombeColors.goldLight, 2),
];

GroupHue groupHue(String id) => _hues[id.codeUnits.fold<int>(7, (int a, int c) => (a * 31 + c) & 0x7fffffff) % _hues.length];

/// Blason d'une tontine : sa photo (lue avec la session, jamais par une URL
/// publique) ; en repli, ses initiales sur le motif du groupe, tant que le bureau
/// n'a pas ajouté de photo. Aucune photo d'illustration à la place du groupe.
class GroupAvatar extends StatelessWidget {
  const GroupAvatar({super.key, required this.groupId, required this.name, this.photoVersion, this.size = 40});

  final String groupId;
  final String name;
  final int? photoVersion;
  final double size;

  @override
  Widget build(BuildContext context) {
    final Widget fallback = _Emblem(hue: groupHue(groupId), name: name, size: size);
    Widget clip(Widget child) => ExcludeSemantics(child: ClipOval(child: SizedBox.square(dimension: size, child: child)));
    final int? v = photoVersion;
    if (v == null) return clip(fallback);
    GroupRepository? repo;
    try {
      repo = context.read<GroupRepository>();
    } on ProviderNotFoundException {
      return clip(fallback);
    }
    final int px = size > 96 ? 512 : 256;
    final Future<Uint8List?> bytes = _cache.putIfAbsent('$groupId:$v:$px', () => repo!.loadPhoto(groupId, v, px));
    return clip(
      FutureBuilder<Uint8List?>(
        future: bytes,
        builder: (BuildContext context, AsyncSnapshot<Uint8List?> snap) {
          final Uint8List? data = snap.data;
          if (data == null) return fallback;
          return Image.memory(data, width: size, height: size, fit: BoxFit.cover, gaplessPlayback: true, cacheWidth: (size * 3).round());
        },
      ),
    );
  }
}

class _Emblem extends StatelessWidget {
  const _Emblem({required this.hue, required this.name, required this.size});
  final GroupHue hue;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(
        painter: _EmblemPainter(hue),
        child: Center(
          child: Text(
            groupInitials(name),
            style: TextStyle(fontFamily: 'Fraunces', color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * .3, height: 1),
          ),
        ),
      );
}

class _EmblemPainter extends CustomPainter {
  _EmblemPainter(this.hue);
  final GroupHue hue;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = hue.bg);
    NdopPainter(color: hue.accent, opacity: .55, variant: hue.variant, tile: math.max(9, size.shortestSide / 4)).paint(canvas, size);
    // Disque plein : les initiales se lisent sur un fond uni.
    final Offset c = size.center(Offset.zero);
    final double d = size.shortestSide * .34;
    canvas.drawCircle(c, d, Paint()..color = hue.bg);
    canvas.drawCircle(c, d, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.2, size.shortestSide * .03)
      ..color = hue.accent);
  }

  @override
  bool shouldRepaint(covariant _EmblemPainter o) => o.hue != hue;
}
