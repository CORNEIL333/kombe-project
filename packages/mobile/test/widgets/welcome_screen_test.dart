import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/features/auth/welcome_screen.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';

void main() {
  testWidgets('welcome screen exposes the two entry actions', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        locale: Locale('fr'),
        supportedLocales: <Locale>[Locale('fr'), Locale('en')],
        localizationsDelegates: <LocalizationsDelegate<dynamic>>[
          AppLocalizations.delegate,
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: WelcomeScreen(),
      ),
    );

    expect(find.text('Se connecter'), findsOneWidget);
    expect(find.text('Créer un compte'), findsOneWidget);
  });
}
