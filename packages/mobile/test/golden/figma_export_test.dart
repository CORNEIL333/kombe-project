// Export des écrans vers docs/figma (captures à hauteur réelle, défilement compris).
// Ne sert pas de régression : ne s'exécute que sur demande.
//   KOMBE_FIGMA=1 flutter test test/golden/figma_export_test.dart --update-goldens
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
  await family('Merriweather', <String>['Merriweather-400.ttf']);
  await family('Libre Franklin', <String>['LibreFranklin-400.ttf', 'LibreFranklin-500.ttf', 'LibreFranklin-600.ttf', 'LibreFranklin-700.ttf', 'LibreFranklin-800.ttf']);
  final File icons = File('${Platform.environment['FLUTTER_ROOT'] ?? ''}/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf');
  if (icons.existsSync()) {
    final FontLoader l = FontLoader('MaterialIcons')..addFont(Future<ByteData>.value(ByteData.sublistView(Uint8List.fromList(icons.readAsBytesSync()))));
    await l.load();
  }
}

const List<(String, String)> _public = <(String, String)>[
  ('auth_01_connexion', '/login'),
  ('auth_02_inscription', '/register'),
  ('auth_03_code', '/verify-code'),
  ('auth_04_recuperation', '/recovery-request'),
  ('auth_05_serveur_requis', '/server-required'),
];

const List<(String, String)> _routes = <(String, String)>[
  ('app_01_accueil', '/app'),
  ('app_02_cotisations', '/app/contributions'),
  ('app_03_groupes', '/app/groups'),
  ('app_04_notifications', '/app/notifications'),
  ('app_05_bureau', '/app/bureau'),
  ('app_07_rejoindre', '/app/groups/join'),
  ('app_08_creer_groupe', '/app/groups/create'),
  ('groupe_01_detail', '/app/groups/essai-etoiles'),
  ('groupe_02_membres', '/app/groups/essai-etoiles/members'),
  ('groupe_03_membre', '/app/groups/essai-etoiles/members/essai-membre-1'),
  ('groupe_04_cycle', '/app/groups/essai-etoiles/cycle'),
  ('groupe_05_beneficiaires', '/app/groups/essai-etoiles/beneficiaries'),
  ('groupe_06_bureau', '/app/groups/essai-etoiles/bureau'),
  ('groupe_07_caisses', '/app/groups/essai-etoiles/funds'),
  ('groupe_08_regles', '/app/groups/essai-etoiles/rules'),
  ('groupe_11_seances', '/app/groups/essai-etoiles/meetings'),
  ('groupe_12_seance', '/app/groups/essai-etoiles/meetings/essai-seance-3'),
  ('groupe_09_inviter', '/app/groups/essai-bamileke/invite'),
  ('groupe_10_reglages', '/app/groups/essai-bamileke/settings'),
  ('paiement_01_declarer', '/app/groups/essai-etoiles/contributions/new'),
  ('paiement_02_detail', '/app/contributions/essai-cot-1'),
  ('paiement_03_validations', '/app/validations'),
  ('paiement_04_validation', '/app/validations/essai-val-1'),
  ('decision_01_votes', '/app/votes'),
  ('decision_02_vote', '/app/votes/essai-vote-1'),
  ('decision_03_amendes', '/app/fines'),
  ('profil_01_profil', '/app/profile'),
  ('profil_02_modifier', '/app/profile/edit'),
  ('reglages_01_securite', '/app/settings/security'),
  ('reglages_02_langue', '/app/settings/language'),
  ('reglages_03_alertes', '/app/settings/notifications'),
  ('reglages_04_confidentialite', '/app/settings/privacy'),
  ('info_01_documents', '/app/documents'),
  ('info_02_aide', '/app/help'),
  ('info_03_support', '/app/support'),
  ('info_04_hors_ligne', '/app/offline'),
  ('info_05_a_propos', '/app/about'),
];

Future<void> _settle(WidgetTester tester) async {
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(seconds: 2));
  for (int i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

double _extent(WidgetTester tester) {
  double best = 0;
  for (final ScrollableState s in tester.stateList<ScrollableState>(find.byType(Scrollable))) {
    if (s.position.axis == Axis.vertical && s.position.hasContentDimensions && s.position.maxScrollExtent > best) {
      best = s.position.maxScrollExtent;
    }
  }
  return best;
}

/// Capture à la hauteur du contenu : le cadre grandit jusqu'à ne plus défiler.
Future<void> _shoot(WidgetTester tester, String dir, String name, double width, double height) async {
  tester.view.physicalSize = Size(width * 2, height * 2);
  await _settle(tester);
  final double extra = _extent(tester);
  if (extra > 0) {
    tester.view.physicalSize = Size(width * 2, (height + extra).ceilToDouble() * 2);
    await _settle(tester);
  }
  await expectLater(find.byType(KombeApp), matchesGoldenFile('figma/$dir/$name.png'));
  tester.view.physicalSize = Size(width * 2, height * 2);
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  final bool enabled = Platform.environment.containsKey('KOMBE_FIGMA');

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    final String tmp = Directory.systemTemp.createTempSync('kombe_figma').path;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (MethodCall call) async => tmp,
    );
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
    await _loadFonts();
  });

  for (final (String dir, double width, double height) in const <(String, double, double)>[('telephone', 390, 844), ('tablette', 820, 1180)]) {
    testWidgets('export $dir', (WidgetTester tester) async {
      tester.view.physicalSize = Size(width * 2, height * 2);
      tester.view.devicePixelRatio = 2;
      addTearDown(tester.view.reset);
      final AppDependencies deps = fakeDependencies(drafts: InMemoryDraftRepository());
      await tester.pumpWidget(KombeApp(dependencies: deps));
      for (int i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await _shoot(tester, dir, 'auth_00_bienvenue', width, height);
      BuildContext ctx() => tester.element(find.byType(Scaffold).first);
      for (final (String name, String route) in _public) {
        GoRouter.of(ctx()).go(route);
        await _shoot(tester, dir, name, width, height);
      }
      GoRouter.of(ctx()).go('/');
      await _settle(tester);
      final Future<Object?> login = deps.authRepository.verifyCode(login: 'essai@kombe.app', code: '000000');
      await tester.pump(const Duration(seconds: 1));
      await login;
      for (int i = 0; i < 30; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      await _shoot(tester, dir, 'app_00_accueil_membre', width, height);
      await tester.tap(find.descendant(of: find.byType(AppBar), matching: find.text('Les Étoiles de Yaoundé')).first);
      await _settle(tester);
      await expectLater(find.byType(KombeApp), matchesGoldenFile('figma/$dir/nav_02_changer_groupe.png'));
      await tester.tap(find.text('Solidarité Bamiléké').last);
      await _settle(tester);
      final List<String> echecs = <String>[];
      for (final (String name, String route) in _routes) {
        GoRouter.of(ctx()).go(route);
        await _shoot(tester, dir, name, width, height);
        final Object? e = tester.takeException();
        if (e != null) echecs.add('$name : ${e.toString().split('\n').first}');
      }
      GoRouter.of(ctx()).go('/app');
      await _settle(tester);
      if (find.byTooltip('Menu').evaluate().isNotEmpty) {
        await tester.tap(find.byTooltip('Menu'));
        await _settle(tester);
        await expectLater(find.byType(KombeApp), matchesGoldenFile('figma/$dir/nav_01_menu.png'));
      }
      expect(echecs, isEmpty);
    }, skip: !enabled);
  }
}
