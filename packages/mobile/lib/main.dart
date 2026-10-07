import 'package:flutter/material.dart';

import 'app/di/app_dependencies.dart';
import 'app/kombe_app.dart';

/// Mode RÉEL seulement si `--dart-define=KOMBE_API_BASE_URL=https://...` est
/// fourni au build — absent par défaut (`flutter run` sans argument reste sur
/// les dépôts fictifs honnêtes), jamais une URL devinée ou codée en dur.
const String _apiBaseUrl = String.fromEnvironment('KOMBE_API_BASE_URL');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final Uri? apiBaseUrl = _apiBaseUrl.isEmpty
      ? null
      : Uri.tryParse(_apiBaseUrl);
  runApp(
    KombeApp(
      dependencies: apiBaseUrl == null
          ? AppDependencies.unconfigured()
          : AppDependencies.configured(apiBaseUrl: apiBaseUrl),
    ),
  );
}
