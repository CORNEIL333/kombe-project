import 'package:flutter/material.dart';

import 'app/di/app_dependencies.dart';
import 'app/kombe_app.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(KombeApp(dependencies: AppDependencies.unconfigured()));
}
