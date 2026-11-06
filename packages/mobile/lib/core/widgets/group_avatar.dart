import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../domain/repositories/group_repository.dart';
import '../../domain/repositories/profile_repository.dart';
import '../design/kombe_colors.dart';
import 'kombe_visuals.dart';

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

/// Photo d'un membre dans un groupe (repli : initiales).
class MemberAvatar extends StatelessWidget {
  const MemberAvatar({super.key, required this.groupId, required this.memberId, required this.name, this.photoVersion, this.size = 44});
  final String groupId;
  final String memberId;
  final String name;
  final int? photoVersion;
  final double size;

  @override
  Widget build(BuildContext context) {
    final int? v = photoVersion;
    if (v == null || groupId.isEmpty) return KombeAvatar(name: name, size: size);
    final GroupRepository repo = context.read<GroupRepository>();
    final int px = size > 96 ? 512 : 256;
    return KombeAvatar(name: name, size: size, load: _cache.putIfAbsent('m:$groupId:$memberId:$v:$px', () => repo.loadMemberPhoto(groupId, memberId, v, px)));
  }
}

/// Ma photo de profil (repli : initiales).
class MyAvatar extends StatelessWidget {
  const MyAvatar({super.key, required this.name, this.photoVersion, this.size = 44});
  final String name;
  final int? photoVersion;
  final double size;

  @override
  Widget build(BuildContext context) {
    final int? v = photoVersion;
    if (v == null) return KombeAvatar(name: name, size: size);
    final ProfileRepository repo = context.read<ProfileRepository>();
    final int px = size > 96 ? 512 : 256;
    return KombeAvatar(name: name, size: size, load: _cache.putIfAbsent('moi:$v:$px', () => repo.loadPhoto(v, px)));
  }
}

/// Avatar rond d'une tontine : sa photo (lue avec la session, jamais par une URL
/// publique) ; en repli, son monogramme serif sur une teinte douce. Aucune photo
/// d'illustration à la place du groupe.
class GroupAvatar extends StatelessWidget {
  const GroupAvatar({super.key, required this.groupId, required this.name, this.photoVersion, this.size = 40});

  final String groupId;
  final String name;
  final int? photoVersion;
  final double size;

  @override
  Widget build(BuildContext context) {
    final Widget fallback = _Monogram(tint: KombeColors.tintOf(groupId), name: name, size: size);
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

class _Monogram extends StatelessWidget {
  const _Monogram({required this.tint, required this.name, required this.size});
  final Color tint;
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) => ColoredBox(
        color: tint,
        child: Center(
          child: Text(
            groupInitials(name),
            style: TextStyle(fontFamily: 'Fraunces', color: KombeColors.ink, fontWeight: FontWeight.w700, fontSize: size * .36, height: 1),
          ),
        ),
      );
}
