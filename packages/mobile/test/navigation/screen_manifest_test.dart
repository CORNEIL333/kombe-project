import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/app/router/screen_manifest.dart';

void main() {
  test('mobile application exposes more than twenty production screens', () {
    expect(ScreenManifest.screens.length, greaterThan(20));
    expect(ScreenManifest.screens.toSet().length, ScreenManifest.screens.length);
  });
}
