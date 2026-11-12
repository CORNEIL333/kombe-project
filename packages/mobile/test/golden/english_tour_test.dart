// Traduction anglaise (A12) : chaque écran du tour, en anglais, ne doit
// afficher aucun texte d'interface en français. Les données des dépôts
// factices (noms de groupes, de personnes, motifs saisis) restent telles
// quelles : elles sont écrites par les membres, pas par l'application.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:kombe_mobile/app/di/app_dependencies.dart';
import 'package:kombe_mobile/app/kombe_app.dart';
import 'package:kombe_mobile/l10n/kombe_l10n.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

import '../support/fake_repositories.dart';

const List<String> _routes = <String>[
  '/app',
  '/app/groups',
  '/app/groups/essai-etoiles',
  '/app/groups/essai-etoiles/cycle',
  '/app/groups/essai-etoiles/members',
  '/app/groups/essai-etoiles/rules',
  '/app/groups/essai-etoiles/contributions/new',
  '/app/contributions',
  '/app/validations',
  '/app/validations/essai-val-1',
  '/app/votes',
  '/app/votes/essai-vote-1',
  '/app/bureau',
  '/app/groups/essai-bamileke/invite',
  '/app/notifications',
  '/app/profile',
  '/app/fines',
  '/app/documents',
  '/app/groups/join',
  '/app/offline',
  '/app/groups/essai-etoiles/funds',
  '/app/groups/essai-etoiles/beneficiaries',
  '/app/groups/essai-etoiles/members/essai-membre-1',
  '/app/groups/create',
  '/app/groups/essai-bamileke/settings',
  '/app/settings/security',
  '/app/settings/language',
  '/app/settings/notifications',
  '/app/settings/privacy',
  '/app/help',
  '/app/support',
  '/app/about',
  '/app/profile/edit',
  '/app/groups/essai-etoiles/meetings',
  '/app/groups/essai-etoiles/meetings/essai-seance-3',
];

/// Mots d'interface français qui n'ont pas d'homographe anglais courant.
final RegExp _french = RegExp(
  r"(?<![\p{L}])(séance|séances|cotisation|cotisations|membres|aucun|aucune|votre|vos|groupe|caisse|caisses|amende|amendes|statuts|bureau|trésorier|trésorerie|tour|tours|réglages|connexion|déconnecter|enregistrer|annuler|retour|voir|tout|à|où|déjà|être|été|demande|vote ouvert|en attente|en retard|à venir|aujourd’hui|hier|il y a)(?![\p{L}])",
  caseSensitive: false,
  unicode: true,
);

/// Les textes des dépôts factices sont des données saisies par des membres :
/// on les retire avant de chercher du français d'interface.
Set<String> fakeDataStrings() {
  final String src = File('test/support/fake_repositories.dart').readAsStringSync();
  final List<String> all = RegExp(r"'((?:[^'\\\n$]|\\.)*)'").allMatches(src).map((RegExpMatch m) => m.group(1)!.replaceAll(r"\'", "'")).where((String v) => v.length >= 3).toList()
    ..sort((String a, String b) => b.length.compareTo(a.length));
  return all.toSet();
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (MethodCall call) async => '/tmp',
    );
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
  });

  tearDown(KombeL10n.reset);

  testWidgets('en anglais, aucun écran du tour n’affiche de texte d’interface français', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(390 * 2, 2400 * 2);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
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
    final Set<String> data = fakeDataStrings();
    final List<String> found = <String>[];
    for (final String route in _routes) {
      GoRouter.of(tester.element(find.byType(Scaffold).first)).go(route);
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(seconds: 2));
      for (int i = 0; i < 12; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      tester.takeException();
      for (final Widget w in tester.allWidgets) {
        final String? text = switch (w) {
          RichText(:final InlineSpan text) => text.toPlainText(),
          Tooltip(:final String? message) => message,
          final Semantics s => s.properties.label,
          _ => null,
        };
        if (text == null || text.trim().isEmpty) continue;
        String rest = text;
        for (final String d in data) {
          if (d.isNotEmpty) rest = rest.replaceAll(d, ' ');
        }
        if (_french.hasMatch(rest)) found.add('$route : $text');
      }
    }
    for (final String f in found.toSet()) {
      // ignore: avoid_print
      print('FR> $f');
    }
    expect(found.toSet().toList(), isEmpty);
  });
}
