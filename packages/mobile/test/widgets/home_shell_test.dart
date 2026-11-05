import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/app/di/app_dependencies.dart';
import 'package:kombe_mobile/app/kombe_app.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../support/fake_repositories.dart';
import '../support/fonts.dart';

Future<void> _settle(WidgetTester tester, {int steps = 30}) async {
  for (int i = 0; i < steps; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  setUpAll(() async {
    await loadKombeFonts();
  });

  setUp(() {
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (MethodCall call) async => '.',
    );
  });

  testWidgets('accueil du groupe actif, changement de groupe, quatre onglets, bureau selon la fonction', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(390 * 3, 844 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final AppDependencies deps = fakeDependencies(drafts: InMemoryDraftRepository());
    await tester.pumpWidget(KombeApp(dependencies: deps));
    await _settle(tester);
    final Future<Object?> login = deps.authRepository.completeLogin(identityId: 'essai@kombe.app', code: '000000');
    await tester.pump(const Duration(seconds: 1));
    await login;
    await _settle(tester, steps: 40);

    // Groupe actif : le premier par défaut, nommé dans la barre.
    expect(find.descendant(of: find.byType(AppBar), matching: find.text('Les Étoiles de Yaoundé')), findsOneWidget);
    expect(find.text('À régler'), findsOneWidget);
    // Quatre destinations stables, quel que soit le rôle.
    for (final String tab in <String>['Accueil', 'Cotisations', 'Groupes', 'Activité']) {
      expect(find.text(tab), findsWidgets);
    }

    // Changer de groupe sans quitter l'écran.
    await tester.tap(find.descendant(of: find.byType(AppBar), matching: find.text('Les Étoiles de Yaoundé')));
    await _settle(tester, steps: 10);
    await tester.tap(find.text('Solidarité Bamiléké').last);
    await _settle(tester, steps: 30);
    expect(find.descendant(of: find.byType(AppBar), matching: find.text('Solidarité Bamiléké')), findsOneWidget);
    expect(find.text('2 paiements à confirmer'), findsOneWidget);
    // Outils du bureau : depuis l'onglet Groupes, seulement là où la personne a une fonction.
    await tester.tap(find.text('Groupes').last);
    await _settle(tester, steps: 20);
    expect(find.text('Mes groupes'), findsOneWidget);
    expect(find.byTooltip('Outils du bureau'), findsOneWidget); // trésorerie de Solidarité Bamiléké
  });
}
