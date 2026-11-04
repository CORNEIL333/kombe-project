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

Future<void> showGroupPhotoSheet(BuildContext context, GroupSummary group) => showKombeSheet<void>(
      context,
      title: 'Photo du groupe',
      builder: (_) => _GroupPhotoPanel(group: group),
    );

class _GroupPhotoPanel extends StatefulWidget {
  const _GroupPhotoPanel({required this.group});
  final GroupSummary group;

  @override
  State<_GroupPhotoPanel> createState() => _GroupPhotoPanelState();
}

class _GroupPhotoPanelState extends State<_GroupPhotoPanel> {
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
        setState(() => _error = 'Choisissez une photo de moins de 15 Mo.');
        return;
      }
      setState(() {
        _source = bytes;
        _zoom = 1;
      });
    } catch (_) {
      setState(() => _error = 'La photo n’a pas pu être ouverte. Essayez-en une autre.');
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
        _error = 'Cette image ne peut pas être utilisée. Essayez une autre photo.';
      });
      return;
    }
    final OperationResult<int> r = await context.read<GroupRepository>().setPhoto(widget.group.id, variants.$1, variants.$2);
    await _after(r);
  }

  Future<void> _remove() async {
    if (_busy) return;
    setState(() => _busy = true);
    await _after(await context.read<GroupRepository>().removePhoto(widget.group.id));
  }

  /// Succès seulement à réception de la réponse ; le cache est invalidé.
  Future<void> _after(OperationResult<Object?> r) async {
    if (!mounted) return;
    switch (r) {
      case OperationSuccess<Object?>():
        forgetGroupPhoto(widget.group.id);
        final ActiveGroupController groups = context.read<ActiveGroupController>();
        final NavigatorState nav = Navigator.of(context);
        final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
        await groups.refresh();
        nav.pop();
        messenger.showSnackBar(const SnackBar(content: Text('Photo du groupe enregistrée.')));
      case OperationFailure<Object?>(:final Object error):
        setState(() {
          _busy = false;
          _error = '$error';
        });
      case OperationBlocked<Object?>():
        setState(() {
          _busy = false;
          _error = 'La photo ne peut pas être changée depuis cette version de l’application.';
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
                ? GroupAvatar(groupId: widget.group.id, name: widget.group.name, photoVersion: widget.group.photoVersion, size: 180)
                : Semantics(
                    label: 'Aperçu de la photo recadrée',
                    image: true,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(50),
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
                const Text('Recadrer'),
                Expanded(
                  child: Slider(
                    value: _zoom,
                    min: 1,
                    max: 3,
                    label: 'Zoom',
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
                  label: const Text('Galerie'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : () => _pick(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera_outlined),
                  label: const Text('Appareil'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          const Text(
            'Photo carrée, visible par les membres du groupe. La position et les informations de l’appareil sont retirées.',
            textAlign: TextAlign.center,
            style: TextStyle(color: KombeColors.slate, fontSize: 13),
          ),
          if (_error != null) ...<Widget>[
            const SizedBox(height: 10),
            Semantics(liveRegion: true, child: Text(_error!, style: const TextStyle(color: KombeColors.danger))),
          ],
          const SizedBox(height: 14),
          FilledButton(
            onPressed: src == null || _busy ? null : _save,
            child: _busy ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2.4)) : const Text('Enregistrer la photo'),
          ),
          if (widget.group.photoVersion != null && src == null)
            TextButton(
              onPressed: _busy ? null : _remove,
              style: TextButton.styleFrom(foregroundColor: KombeColors.danger),
              child: const Text('Retirer la photo'),
            ),
        ],
      ),
    );
  }
}
