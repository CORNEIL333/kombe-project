import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/app/di/app_dependencies.dart';
import 'package:kombe_mobile/app/kombe_app.dart';
import 'package:kombe_mobile/core/state/resource.dart';
import 'package:kombe_mobile/domain/entities/profile.dart';
import 'package:kombe_mobile/l10n/kombe_l10n.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../support/fake_repositories.dart';

/// A15 : la langue de l'application est reportée sur le profil serveur à la
/// connexion, pour que les notifications hors application partent dans cette
/// langue. Le nom affiché ne change pas.
void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (MethodCall call) async => '.',
    );
  });
  tearDown(KombeL10n.reset);

  testWidgets('la langue choisie avant la connexion rejoint le profil', (WidgetTester tester) async {
    final AppDependencies deps = fakeDependencies(drafts: InMemoryDraftRepository());
    await deps.preferencesRepository.saveLocaleCode('en');
    await tester.pumpWidget(KombeApp(dependencies: deps));
    for (int i = 0; i < 30; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    final Future<Object?> login = deps.authRepository.verifyCode(login: 'essai@kombe.app', code: '000000');
    await tester.pump(const Duration(seconds: 1));
    await login;
    for (int i = 0; i < 30; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    final Future<Resource<UserProfile>> read = deps.profileRepository.loadProfile();
    await tester.pump(const Duration(seconds: 1));
    final Resource<UserProfile> p = await read;
    expect(p, isA<ResourceReady<UserProfile>>());
    final UserProfile profile = (p as ResourceReady<UserProfile>).data;
    expect(profile.localeCode, 'en');
    expect(profile.displayName, 'Amina Ngué');
  });
}
