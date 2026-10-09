// Visite visuelle de TOUTE l'app en mode essai (QA UI/UX, mandat §52).
// Lance la vraie app (routeur, thème, écrans) sur les dépôts d'essai, se
// connecte, puis capture chaque route. Données datées « aujourd'hui » : ce test
// ne s'exécute que sur demande, il ne sert pas de régression.
//   KOMBE_TOUR=1 flutter test test/golden/app_tour_test.dart --update-goldens
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kombe_mobile/app/di/app_dependencies.dart';
import 'package:kombe_mobile/app/kombe_app.dart';
import 'package:kombe_mobile/trial/trial_mode.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

Future<void> _loadFonts() async {
  Future<void> family(String name, List<String> files) async {
    final FontLoader l = FontLoader(name);
    for (final String f in files) {
      l.addFont(Future<ByteData>.value(ByteData.sublistView(Uint8List.fromList(File('assets/fonts/$f').readAsBytesSync()))));
    }
    await l.load();
  }

  await family('Manrope', <String>['Manrope-400.ttf', 'Manrope-500.ttf', 'Manrope-600.ttf', 'Manrope-700.ttf', 'Manrope-800.ttf']);
  await family('Fraunces', <String>['Fraunces-Display-500.ttf', 'Fraunces-Title-600.ttf']);
  final File icons = File('${Platform.environment['FLUTTER_ROOT'] ?? ''}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (icons.existsSync()) {
    final FontLoader l = FontLoader('MaterialIcons')..addFont(Future<ByteData>.value(ByteData.sublistView(Uint8List.fromList(icons.readAsBytesSync()))));
    await l.load();
  }
}

const List<(String, String)> _routes = <(String, String)>[
  ('01_accueil', '/app'),
  ('02_groupes', '/app/groups'),
  ('03_groupe', '/app/groups/essai-etoiles'),
  ('04_cycle', '/app/groups/essai-etoiles/cycle'),
  ('05_membres', '/app/groups/essai-etoiles/members'),
  ('06_regles', '/app/groups/essai-etoiles/rules'),
  ('07_declarer', '/app/groups/essai-etoiles/contributions/new'),
  ('08_historique', '/app/contributions'),
  ('09_validations', '/app/validations'),
  ('10_validation', '/app/validations/essai-val-1'),
  ('11_votes', '/app/votes'),
  ('12_vote', '/app/votes/essai-vote-1'),
  ('13_litiges', '/app/disputes'),
  ('14_litige', '/app/disputes/essai-lit-1'),
  ('15_notifications', '/app/notifications'),
  ('16_profil', '/app/profile'),
  ('17_plus', '/app/more'),
  ('18_documents', '/app/documents'),
  ('19_rejoindre', '/app/groups/join'),
  ('20_hors_ligne', '/app/offline'),
];

void main() {
  final bool enabled = Platform.environment.containsKey('KOMBE_TOUR');

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final String tmp = Directory.systemTemp.createTempSync('kombe_tour').path;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (MethodCall call) async => tmp,
    );
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    await _loadFonts();
  });

  testWidgets('tour de l\'app en mode essai', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(390 * 2, 844 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final AppDependencies deps = trialDependencies();
    final TrialStatus status = TrialStatus(DateTime.now().toUtc().subtract(const Duration(days: 7)), DateTime.now().toUtc());
    await tester.pumpWidget(KombeApp(
      dependencies: deps,
      builder: (BuildContext c, Widget? child) => TrialBanner(status: status, child: child!),
    ));
    for (int i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await expectLater(find.byType(KombeApp), matchesGoldenFile('tour/00_bienvenue.png'));

    // L'horloge du test n'avance qu'avec les frames : on fait tourner le temps pendant la connexion.
    final Future<Object?> login = deps.authRepository.completeLogin(identityId: 'essai@kombe.app', code: '000000');
    await tester.pump(const Duration(seconds: 1));
    await login;
    for (int i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    for (final (String name, String route) in _routes) {
      GoRouter.of(tester.element(find.byType(Scaffold).first)).go(route);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(seconds: 2));
      for (int i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await expectLater(find.byType(KombeApp), matchesGoldenFile('tour/$name.png'));
    }
  }, skip: !enabled);
}
