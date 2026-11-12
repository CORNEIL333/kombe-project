import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kombe_mobile/core/formatters/labels.dart';
import 'package:kombe_mobile/domain/entities/group.dart';
import 'package:kombe_mobile/l10n/app_localizations.dart';
import 'package:kombe_mobile/l10n/kombe_l10n.dart';

void main() {
  testWidgets('Les libellés calculés suivent la langue choisie', (WidgetTester tester) async {
    expect(apiRoleLabel('treasurer'), 'Trésorier', reason: 'français par défaut');
    await tester.pumpWidget(MaterialApp(
      locale: const Locale('en'),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: Builder(builder: (BuildContext context) {
        KombeL10n.update(context);
        return const SizedBox.shrink();
      }),
    ));
    expect(apiRoleLabel('treasurer'), 'Treasurer');
    expect(cadenceKindLabel(CadenceKind.weekly), 'Every week');
    expect(KombeLabels.role(GroupRole.administrator), 'Presidency');
    KombeL10n.reset();
    expect(apiRoleLabel('treasurer'), 'Trésorier');
  });
}
