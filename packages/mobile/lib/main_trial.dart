// KÓMBE — point d'entrée du MODE ESSAI (30 jours, données fictives).
// Build : flutter build apk -t lib/main_trial.dart
// L'app de production (main.dart) n'importe jamais lib/trial/.
import 'package:flutter/material.dart';

import 'app/kombe_app.dart';
import 'trial/trial_mode.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final TrialStatus status = await TrialStatus.load();
  if (status.expired) {
    runApp(const TrialExpiredApp());
    return;
  }
  runApp(
    KombeApp(
      dependencies: trialDependencies(),
      builder: (BuildContext context, Widget? child) =>
          TrialBanner(status: status, child: child ?? const SizedBox.shrink()),
    ),
  );
}
