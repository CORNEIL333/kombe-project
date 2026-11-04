import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:kombe_mobile/domain/entities/group.dart';
import 'package:kombe_mobile/features/groups/group_photo_sheet.dart';

void main() {
  test('photo préparée : carrés 512 et 256, sous les limites du serveur, sans EXIF', () {
    final img.Image source = img.Image(width: 1200, height: 800);
    img.fill(source, color: img.ColorRgb8(16, 60, 50));
    source.exif.imageIfd['Make'] = 'TelephoneSecret';
    final Uint8List jpeg = img.encodeJpg(source);
    expect(img.decodeJpg(jpeg)!.exif.isEmpty, isFalse);

    final (Uint8List, Uint8List)? out = prepareGroupPhoto((jpeg, 1.5));
    expect(out, isNotNull);
    final img.Image v512 = img.decodeJpg(out!.$1)!;
    final img.Image v256 = img.decodeJpg(out.$2)!;
    expect(<int>[v512.width, v512.height], <int>[512, 512]);
    expect(<int>[v256.width, v256.height], <int>[256, 256]);
    expect(out.$1.length, lessThanOrEqualTo(400 * 1024));
    expect(out.$2.length, lessThanOrEqualTo(150 * 1024));
    expect(v512.exif.isEmpty, isTrue);
  });

  test('fichier illisible : refusé sans planter', () {
    expect(prepareGroupPhoto((Uint8List.fromList(<int>[1, 2, 3]), 1)), isNull);
  });

  test('bouton « Modifier la photo » : présidence et secrétariat seulement', () {
    expect(canEditGroupPhoto(GroupRole.administrator), isTrue);
    expect(canEditGroupPhoto(GroupRole.secretary), isTrue);
    expect(canEditGroupPhoto(GroupRole.treasurer), isFalse);
    expect(canEditGroupPhoto(GroupRole.member), isFalse);
  });
}
