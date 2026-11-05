// Visite visuelle de TOUTE l'app (QA UI/UX, mandat §52).
// Lance la vraie app (routeur, thème, écrans) sur des dépôts factices de test, se
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
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../support/fake_repositories.dart';

Future<void> _loadFonts() async {
  Future<void> family(String name, List<String> files) async {
    final FontLoader l = FontLoader(name);
    for (final String f in files) {
      l.addFont(Future<ByteData>.value(ByteData.sublistView(Uint8List.fromList(File('assets/fonts/$f').readAsBytesSync()))));
    }
    await l.load();
  }

  await family('Manrope', <String>['Manrope-400.ttf', 'Manrope-500.ttf', 'Manrope-600.ttf', 'Manrope-700.ttf', 'Manrope-800.ttf']);
  await family('Fraunces', <String>['Fraunces-600.ttf', 'Fraunces-700.ttf']);
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
  ('13_bureau', '/app/bureau'),
  ('14_inviter', '/app/groups/essai-bamileke/invite'),
  ('15_notifications', '/app/notifications'),
  ('16_profil', '/app/profile'),
  ('17_amendes', '/app/fines'),
  ('18_documents', '/app/documents'),
  ('19_rejoindre', '/app/groups/join'),
  ('20_hors_ligne', '/app/offline'),
  ('23_caisses', '/app/groups/essai-etoiles/funds'),
  ('24_beneficiaires', '/app/groups/essai-etoiles/beneficiaries'),
  ('25_membre', '/app/groups/essai-etoiles/members/essai-membre-1'),
  ('26_creer', '/app/groups/create'),
  ('27_reglages_groupe', '/app/groups/essai-bamileke/settings'),
  ('28_securite', '/app/settings/security'),
  ('29_langue', '/app/settings/language'),
  ('30_alertes', '/app/settings/notifications'),
  ('31_confidentialite', '/app/settings/privacy'),
  ('32_aide', '/app/help'),
  ('33_support', '/app/support'),
  ('34_a_propos', '/app/about'),
  ('35_modifier_profil', '/app/profile/edit'),
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
    await _loadFonts();
  });

  testWidgets('tour de l\'app', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(390 * 2, 844 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final AppDependencies deps = fakeDependencies(drafts: InMemoryDraftRepository());
    await tester.pumpWidget(KombeApp(dependencies: deps));
    // Ouverture animée de la marque, saisie en plein mouvement.
    for (int i = 0; i < 9; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await expectLater(find.byType(KombeApp), matchesGoldenFile('tour/00a_ouverture.png'));
    for (int i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await expectLater(find.byType(KombeApp), matchesGoldenFile('tour/00_bienvenue.png'));

    // L'horloge du test n'avance qu'avec les frames : on fait tourner le temps pendant la connexion.
    final Future<Object?> login = deps.authRepository.verifyCode(login: 'essai@kombe.app', code: '000000');
    await tester.pump(const Duration(seconds: 1));
    await login;
    for (int i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    // Accueil d'un simple membre, puis changement de groupe (trésorerie).
    for (int i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await expectLater(find.byType(KombeApp), matchesGoldenFile('tour/01a_accueil_membre.png'));
    await tester.tap(find.descendant(of: find.byType(AppBar), matching: find.text('Les Étoiles de Yaoundé')).first);
    for (int i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await expectLater(find.byType(KombeApp), matchesGoldenFile('tour/22_changer_groupe.png'));
    await tester.tap(find.text('Solidarité Bamiléké').last);
    for (int i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    for (final (String name, String route) in _routes) {
      // ignore: avoid_print
      print('tour → $name');
      GoRouter.of(tester.element(find.byType(Scaffold).first)).go(route);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(seconds: 2));
      for (int i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await expectLater(find.byType(KombeApp), matchesGoldenFile('tour/$name.png'));
    }
    // Menu latéral et changement de groupe, depuis l'accueil.
    GoRouter.of(tester.element(find.byType(Scaffold).first)).go('/app');
    for (int i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await tester.tap(find.byTooltip('Menu'));
    for (int i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    await expectLater(find.byType(KombeApp), matchesGoldenFile('tour/21_menu.png'));
  }, skip: !enabled);

  // Contrôle mesuré, pas seulement visuel : tout écran du tour, sur le plus
  // petit téléphone visé et avec un texte agrandi, sans aucun débordement
  // (un RenderFlex qui déborde fait échouer ce test).
  for (final (double width, double scale) in const <(double, double)>[(320, 1), (360, 1.3)]) {
    testWidgets('aucun débordement à $width px, texte × $scale', (WidgetTester tester) async {
      tester.view.physicalSize = Size(width * 2, 640 * 2);
      tester.view.devicePixelRatio = 2;
      tester.platformDispatcher.textScaleFactorTestValue = scale;
      addTearDown(tester.view.reset);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final AppDependencies deps = fakeDependencies(drafts: InMemoryDraftRepository());
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
      final List<String> defauts = <String>[];
      for (final (String name, String route) in _routes) {
        GoRouter.of(tester.element(find.byType(Scaffold).first)).go(route);
        await tester.pump(const Duration(milliseconds: 100));
        final Object? a = tester.takeException();
        await tester.pump(const Duration(seconds: 2));
        final Object? b = tester.takeException();
        for (int i = 0; i < 12; i++) {
          await tester.pump(const Duration(milliseconds: 100));
        }
        final Object? c = tester.takeException();
        final Object? e = a ?? b ?? c;
        if (e != null) defauts.add('$name : ${e.toString().split('\n').first}');
      }
      expect(defauts, isEmpty);
    });
  }
}
