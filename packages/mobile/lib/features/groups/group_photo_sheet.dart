import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../app/active_group_controller.dart';
import '../../core/design/kombe_colors.dart';
import '../../core/state/operation_result.dart';
import '../../core/widgets/group_avatar.dart';
import '../../core/widgets/kombe_sheet.dart';
import '../../domain/entities/group.dart';
import '../../domain/repositories/group_repository.dart';
import '../../domain/repositories/profile_repository.dart';
import '../../l10n/app_localizations.dart';

/// Présidence et secrétariat (miroir de `group.photo` ; le serveur tranche).
bool canEditGroupPhoto(GroupRole role) => role == GroupRole.administrator || role == GroupRole.secretary;

/// Limites du serveur (`cleanGroupPhoto`).
const int _max512 = 400 * 1024;
const int _max256 = 150 * 1024;

/// Prépare les deux variantes hors du fil d'interface : orientation appliquée,
/// carré centré réduit par le zoom, JPEG ré-encodés (EXIF/GPS non recopiés).
(Uint8List, Uint8List)? prepareGroupPhoto((Uint8List, double) input) {
  img.Image? decoded;
  try {
    decoded = img.decodeImage(input.$1);
  } catch (_) {
    return null; // fichier malformé : refusé sans planter
  }
  if (decoded == null) return null;
  final img.Image oriented = img.bakeOrientation(decoded);
  final int side = (oriented.width < oriented.height ? oriented.width : oriented.height) ~/ input.$2;
  final img.Image square = img.copyCrop(
    oriented,
    x: (oriented.width - side) ~/ 2,
    y: (oriented.height - side) ~/ 2,
    width: side,
    height: side,
  );
  Uint8List? encode(int size, int max) {
    final img.Image resized = img.copyResize(square, width: size, height: size, interpolation: img.Interpolation.average)
      // La bibliothèque recopie l'EXIF de l'original (appareil, GPS) : on l'efface.
      ..exif = img.ExifData();
    for (final int q in <int>[86, 78, 68, 58]) {
      final Uint8List out = img.encodeJpg(resized, quality: q);
      if (out.length <= max) return out;
    }
    return null;
  }

  final Uint8List? v512 = encode(512, _max512);
  final Uint8List? v256 = encode(256, _max256);
  return v512 == null || v256 == null ? null : (v512, v256);
}

Future<void> showGroupPhotoSheet(BuildContext context, GroupSummary group) {
  final GroupRepository repo = context.read<GroupRepository>();
  final ActiveGroupController groups = context.read<ActiveGroupController>();
  return showKombeSheet<void>(
    context,
    title: AppLocalizations.of(context).phPhotoDuGroupe,
    builder: (_) => PhotoPanel(
      preview: GroupAvatar(groupId: group.id, name: group.name, photoVersion: group.photoVersion, size: 180),
      hasPhoto: group.photoVersion != null,
      note: AppLocalizations.of(context).phVisibleParLesMembresDu,
      savedMessage: AppLocalizations.of(context).phPhotoDuGroupeEnregistree,
      save: (Uint8List a, Uint8List b) => repo.setPhoto(group.id, a, b),
      remove: () => repo.removePhoto(group.id),
      afterChange: () async {
        forgetGroupPhoto(group.id);
        await groups.refresh();
      },
    ),
  );
}

/// Ma photo de profil, même parcours que celle du groupe.
Future<void> showMyPhotoSheet(BuildContext context, {required String name, required int? photoVersion, required Future<void> Function() afterChange}) {
  final ProfileRepository repo = context.read<ProfileRepository>();
  return showKombeSheet<void>(
    context,
    title: AppLocalizations.of(context).phMaPhoto,
    builder: (_) => PhotoPanel(
      preview: MyAvatar(name: name, photoVersion: photoVersion, size: 180),
      hasPhoto: photoVersion != null,
      note: AppLocalizations.of(context).phVisibleParLesMembresDe,
      savedMessage: AppLocalizations.of(context).phPhotoEnregistree,
      save: repo.setPhoto,
      remove: repo.removePhoto,
      afterChange: afterChange,
    ),
  );
}

class PhotoPanel extends StatefulWidget {
  const PhotoPanel({
    super.key,
    required this.preview,
    required this.hasPhoto,
    required this.note,
    required this.savedMessage,
    required this.save,
    required this.remove,
    required this.afterChange,
  });
  final Widget preview;
  final bool hasPhoto;
  final String note;
  final String savedMessage;
  final Future<OperationResult<Object?>> Function(Uint8List jpeg512, Uint8List jpeg256) save;
  final Future<OperationResult<Object?>> Function() remove;
  final Future<void> Function() afterChange;

  @override
  State<PhotoPanel> createState() => _PhotoPanelState();
}

class _PhotoPanelState extends State<PhotoPanel> {
  Uint8List? _source;
  double _zoom = 1;
  bool _busy = false;
  String? _error;

  Future<void> _pick(ImageSource source) async {
    setState(() => _error = null);
    try {
      final XFile? file = await ImagePicker().pickImage(source: source, maxWidth: 2400, maxHeight: 2400, imageQuality: 95);
      if (file == null) return;
      final Uint8List bytes = await file.readAsBytes();
      if (bytes.length > 15 * 1024 * 1024) {
        setState(() => _error = AppLocalizations.of(context).phChoisissezUnePhotoDeMoins);
        return;
      }
      setState(() {
        _source = bytes;
        _zoom = 1;
      });
    } catch (_) {
      setState(() => _error = AppLocalizations.of(context).phLaPhotoNaPasPu);
    }
  }

  Future<void> _save() async {
    final Uint8List? src = _source;
    if (src == null || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final (Uint8List, Uint8List)? variants = await compute(prepareGroupPhoto, (src, _zoom));
    if (!mounted) return;
    if (variants == null) {
      setState(() {
        _busy = false;
        _error = AppLocalizations.of(context).phCetteImageNePeutPas;
      });
      return;
    }
    await _after(await widget.save(variants.$1, variants.$2));
  }

  Future<void> _remove() async {
    if (_busy) return;
    setState(() => _busy = true);
    await _after(await widget.remove());
  }

  /// Succès seulement à réception de la réponse ; le cache est invalidé.
  Future<void> _after(OperationResult<Object?> r) async {
    if (!mounted) return;
    switch (r) {
      case OperationSuccess<Object?>():
        final NavigatorState nav = Navigator.of(context);
        final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
        await widget.afterChange();
        nav.pop();
        messenger.showSnackBar(SnackBar(content: Text(widget.savedMessage)));
      case OperationFailure<Object?>(:final Object error):
        setState(() {
          _busy = false;
          _error = '$error';
        });
      case OperationBlocked<Object?>():
        setState(() {
          _busy = false;
          _error = AppLocalizations.of(context).phLaPhotoNePeutPas;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final Uint8List? src = _source;
    return PopScope(
      canPop: !_busy,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: <Widget>[
          Center(
            child: src == null
                ? widget.preview
                : Semantics(
                    label: AppLocalizations.of(context).phApercuDeLaPhotoRecadree,
                    image: true,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(90),
                      child: SizedBox.square(
                        dimension: 180,
                        child: Transform.scale(scale: _zoom, child: Image.memory(src, fit: BoxFit.cover)),
                      ),
                    ),
                  ),
          ),
          if (src != null)
            Row(
              children: <Widget>[
                Text(AppLocalizations.of(context).phRecadrer),
                Expanded(
                  child: Slider(
                    value: _zoom,
                    min: 1,
                    max: 3,
                    label: AppLocalizations.of(context).phZoom,
                    onChanged: _busy ? null : (double v) => setState(() => _zoom = v),
                  ),
                ),
              ],
            ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _pick(ImageSource.gallery),
                  icon: const Icon(Icons.photo_library_outlined),
                  label: Text(AppLocalizations.of(context).phGalerie),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _pick(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: Text(AppLocalizations.of(context).phAppareil),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(widget.note, textAlign: TextAlign.center, style: const TextStyle(color: KombeColors.slate, fontSize: 14)),
          if (_error != null) ...<Widget>[
            const SizedBox(height: 10),
            Semantics(liveRegion: true, child: Text(_error!, style: const TextStyle(color: KombeColors.danger))),
          ],
          const SizedBox(height: 14),
          FilledButton(
            onPressed: src == null || _busy ? null : _save,
            child: _busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.4)) : Text(AppLocalizations.of(context).phEnregistrerLaPhoto),
          ),
          if (widget.hasPhoto && src == null)
            TextButton(
              onPressed: _busy ? null : _remove,
              style: TextButton.styleFrom(foregroundColor: KombeColors.danger),
              child: Text(AppLocalizations.of(context).phRetirerLaPhoto),
            ),
        ],
      ),
    );
  }
}
